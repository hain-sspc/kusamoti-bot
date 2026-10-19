const fs = require('fs');
const path = require('path');
const tf = require('@tensorflow/tfjs-core');
require('@tensorflow/tfjs-backend-cpu');
const tfLayers = require('@tensorflow/tfjs-layers');

const CORPUS_FILE = path.join(__dirname, '..', 'data', 'ai_token_corpus.json');
const MODEL_FILE = path.join(__dirname, '..', 'data', 'ai_token_model.json');
const CORPUS_VERSION = 1;
const MODEL_VERSION = 1;
const CONTEXT_LENGTH = 8;
const MAX_VOCABULARY_SIZE = 512;
const MAX_TRAINING_EXAMPLES = 1024;
const RETRAIN_EVERY = 64;
const EPOCHS = 2;
const BATCH_SIZE = 32;

const SPECIAL_TOKENS = {
    pad: '<PAD>',
    unknown: '<UNK>',
    start: '<BOS>',
    end: '<EOS>',
    separator: '<SEP>'
};

let model = null;
let modelVocabularyIds = [];
let modelTokenIndexes = new Map();
let trainedRevision = -1;
let newSequencesSinceTrain = 0;
let trainingPromise = null;
let trainingScheduled = false;
let trainingTimer = null;
let corpusCache = null;
let sequenceKeyCache = null;

function createCorpus() {
    return {
        version: CORPUS_VERSION,
        revision: 0,
        vocabulary: {
            [SPECIAL_TOKENS.pad]: 0,
            [SPECIAL_TOKENS.unknown]: 1,
            [SPECIAL_TOKENS.start]: 2,
            [SPECIAL_TOKENS.end]: 3,
            [SPECIAL_TOKENS.separator]: 4
        },
        sequences: []
    };
}

function readCorpus() {
    if (corpusCache) return corpusCache;
    if (!fs.existsSync(CORPUS_FILE)) {
        corpusCache = createCorpus();
        return corpusCache;
    }

    const corpus = JSON.parse(fs.readFileSync(CORPUS_FILE, 'utf8'));
    if (
        corpus.version !== CORPUS_VERSION ||
        !Number.isSafeInteger(corpus.revision) ||
        !corpus.vocabulary ||
        !Array.isArray(corpus.sequences)
    ) {
        throw new Error(`AI token corpus has an unsupported or invalid format: ${CORPUS_FILE}`);
    }

    const vocabularyIds = Object.values(corpus.vocabulary);
    if (
        vocabularyIds.some(id => !Number.isSafeInteger(id) || id < 0) ||
        new Set(vocabularyIds).size !== vocabularyIds.length ||
        vocabularyIds.reduce((maximum, id) => Math.max(maximum, id), -1) !== vocabularyIds.length - 1
    ) {
        throw new Error(`AI token corpus contains an invalid vocabulary: ${CORPUS_FILE}`);
    }

    for (const [index, token] of Object.values(SPECIAL_TOKENS).entries()) {
        if (corpus.vocabulary[token] !== index) {
            throw new Error(`AI token corpus is missing a reserved token: ${token}`);
        }
    }

    for (const sequence of corpus.sequences) {
        if (
            !sequence ||
            !['message', 'conversation'].includes(sequence.kind) ||
            !Array.isArray(sequence.tokenIds) ||
            sequence.tokenIds.some(id =>
                !Number.isSafeInteger(id) || id < 0 || id >= vocabularyIds.length
            )
        ) {
            throw new Error(`AI token corpus contains an invalid sequence: ${CORPUS_FILE}`);
        }
    }

    corpusCache = corpus;
    return corpusCache;
}

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporaryFile = `${file}.${process.pid}.tmp`;

    try {
        fs.writeFileSync(temporaryFile, JSON.stringify(value));
        fs.renameSync(temporaryFile, file);
    } catch (error) {
        if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
        if (file === CORPUS_FILE) {
            corpusCache = null;
            sequenceKeyCache = null;
        }
        throw error;
    }
}

function addTrainingExamples(examples) {
    if (!Array.isArray(examples) || examples.length === 0) return 0;

    const corpus = readCorpus();
    if (!sequenceKeyCache) {
        sequenceKeyCache = new Set(
            corpus.sequences.map(sequence => `${sequence.kind}:${sequence.tokenIds.join(',')}`)
        );
    }
    const sequenceKeys = sequenceKeyCache;
    let added = 0;

    function tokenId(token) {
        let id = corpus.vocabulary[token];
        if (id === undefined) {
            id = Object.keys(corpus.vocabulary).length;
            corpus.vocabulary[token] = id;
        }
        return id;
    }

    for (const example of examples) {
        if (!example || !['message', 'conversation'].includes(example.kind)) continue;

        const inputTokens = Array.isArray(example.tokens)
            ? example.tokens.filter(token => typeof token === 'string' && token.length > 0)
            : [];
        const replyTokens = example.kind === 'conversation' && Array.isArray(example.replyTokens)
            ? example.replyTokens.filter(token => typeof token === 'string' && token.length > 0)
            : [];

        if (inputTokens.length === 0 || (example.kind === 'conversation' && replyTokens.length === 0)) {
            continue;
        }

        const tokenIds = [
            corpus.vocabulary[SPECIAL_TOKENS.start],
            ...inputTokens.map(tokenId)
        ];

        if (example.kind === 'conversation') {
            tokenIds.push(corpus.vocabulary[SPECIAL_TOKENS.separator]);
            tokenIds.push(...replyTokens.map(tokenId));
        }

        tokenIds.push(corpus.vocabulary[SPECIAL_TOKENS.end]);
        const key = `${example.kind}:${tokenIds.join(',')}`;

        if (sequenceKeys.has(key)) continue;

        sequenceKeys.add(key);
        corpus.sequences.push({ kind: example.kind, tokenIds });
        added++;
    }

    if (added === 0) return 0;

    corpus.revision++;
    writeJson(CORPUS_FILE, corpus);
    newSequencesSinceTrain += added;
    scheduleTraining();
    return added;
}

async function replaceConversationExample(tokens, replyTokens) {
    if (!Array.isArray(tokens) || !Array.isArray(replyTokens) || tokens.length === 0 || replyTokens.length === 0) {
        return { changed: false, removed: 0, trained: Boolean(model) };
    }

    while (trainingPromise) {
        await trainingPromise;
    }

    if (trainingTimer) {
        clearImmediate(trainingTimer);
        trainingTimer = null;
        trainingScheduled = false;
    }

    const corpus = readCorpus();
    function tokenId(token) {
        let id = corpus.vocabulary[token];
        if (id === undefined) {
            id = Object.keys(corpus.vocabulary).length;
            corpus.vocabulary[token] = id;
        }
        return id;
    }

    const inputIds = tokens.map(tokenId);
    const replyIds = replyTokens.map(tokenId);
    const expectedPrefix = [
        corpus.vocabulary[SPECIAL_TOKENS.start],
        ...inputIds,
        corpus.vocabulary[SPECIAL_TOKENS.separator]
    ];
    const replacement = {
        kind: 'conversation',
        tokenIds: [
            ...expectedPrefix,
            ...replyIds,
            corpus.vocabulary[SPECIAL_TOKENS.end]
        ]
    };
    const matchingSequences = corpus.sequences.filter(sequence =>
        sequence.kind === 'conversation' &&
        expectedPrefix.every((id, index) => sequence.tokenIds[index] === id)
    );
    if (
        matchingSequences.length === 1 &&
        matchingSequences[0].tokenIds.length === replacement.tokenIds.length &&
        matchingSequences[0].tokenIds.every((id, index) => id === replacement.tokenIds[index])
    ) {
        return { changed: false, removed: 0, trained: Boolean(model) };
    }

    corpus.sequences = corpus.sequences.filter(sequence =>
        !(
            sequence.kind === 'conversation' &&
            expectedPrefix.every((id, index) => sequence.tokenIds[index] === id)
        )
    );
    corpus.sequences.push(replacement);
    corpus.revision++;
    writeJson(CORPUS_FILE, corpus);
    sequenceKeyCache = null;
    newSequencesSinceTrain++;
    scheduleTraining();
    return {
        changed: true,
        removed: matchingSequences.length,
        trained: false
    };
}

function buildTrainingData(corpus) {
    const frequencies = new Map();

    for (const sequence of corpus.sequences) {
        for (const id of sequence.tokenIds) {
            if (id > 4) frequencies.set(id, (frequencies.get(id) || 0) + 1);
        }
    }

    const vocabularyIds = [0, 1, 2, 3, 4];
    const frequentIds = [...frequencies.entries()]
        .sort((left, right) => right[1] - left[1] || left[0] - right[0])
        .slice(0, MAX_VOCABULARY_SIZE - vocabularyIds.length)
        .map(([id]) => id);
    vocabularyIds.push(...frequentIds);

    const tokenIndexes = new Map(vocabularyIds.map((id, index) => [id, index]));
    const examples = [];

    for (const sequence of corpus.sequences) {
        const ids = sequence.tokenIds.map(id => tokenIndexes.get(id) ?? 1);

        for (let index = 1; index < ids.length; index++) {
            const target = ids[index];
            if (target === 0 || target === 2) continue;

            const context = ids.slice(Math.max(0, index - CONTEXT_LENGTH), index);
            examples.push({
                input: [...Array(CONTEXT_LENGTH - context.length).fill(0), ...context],
                target
            });
        }
    }

    const stride = Math.max(1, Math.ceil(examples.length / MAX_TRAINING_EXAMPLES));
    const selectedExamples = examples.filter((_, index) => index % stride === 0)
        .slice(0, MAX_TRAINING_EXAMPLES);

    return { vocabularyIds, tokenIndexes, examples: selectedExamples };
}

function createModel(vocabularySize) {
    const input = tfLayers.input({ shape: [CONTEXT_LENGTH], dtype: 'int32' });
    const embedded = tfLayers.layers.embedding({
        inputDim: vocabularySize,
        outputDim: 32,
        maskZero: true
    }).apply(input);
    const recurrent = tfLayers.layers.gru({
        units: 24,
        recurrentInitializer: 'glorotUniform'
    }).apply(embedded);
    const output = tfLayers.layers.dense({
        units: vocabularySize,
        activation: 'softmax'
    }).apply(recurrent);
    const nextTokenModel = tfLayers.model({ inputs: input, outputs: output });

    nextTokenModel.compile({
        optimizer: tf.train.adam(0.003),
        loss: 'sparseCategoricalCrossentropy'
    });

    return nextTokenModel;
}

function setModelVocabulary(vocabularyIds) {
    modelVocabularyIds = vocabularyIds;
    modelTokenIndexes = new Map(vocabularyIds.map((id, index) => [id, index]));
}

async function loadCheckpoint(revision) {
    if (!fs.existsSync(MODEL_FILE)) return false;

    const checkpoint = JSON.parse(fs.readFileSync(MODEL_FILE, 'utf8'));
    if (
        checkpoint.version !== MODEL_VERSION ||
        checkpoint.corpusRevision !== revision ||
        !Array.isArray(checkpoint.vocabularyIds) ||
        typeof checkpoint.weightData !== 'string'
    ) {
        return false;
    }

    const bytes = Buffer.from(checkpoint.weightData, 'base64');
    const weightData = Uint8Array.from(bytes).buffer;
    const loadedModel = await tfLayers.loadLayersModel({
        load: async () => ({
            modelTopology: checkpoint.modelTopology,
            weightSpecs: checkpoint.weightSpecs,
            weightData
        })
    });

    model?.dispose();
    model = loadedModel;
    setModelVocabulary(checkpoint.vocabularyIds);
    trainedRevision = revision;
    return true;
}

async function saveCheckpoint(corpusRevision) {
    await model.save(tf.io.withSaveHandler(async artifacts => {
        writeJson(MODEL_FILE, {
            version: MODEL_VERSION,
            corpusRevision,
            vocabularyIds: modelVocabularyIds,
            modelTopology: artifacts.modelTopology,
            weightSpecs: artifacts.weightSpecs,
            weightData: Buffer.from(artifacts.weightData).toString('base64')
        });

        return {
            modelArtifactsInfo: {
                dateSaved: new Date(),
                modelTopologyType: 'JSON',
                modelTopologyBytes: Buffer.byteLength(JSON.stringify(artifacts.modelTopology)),
                weightSpecsBytes: Buffer.byteLength(JSON.stringify(artifacts.weightSpecs)),
                weightDataBytes: artifacts.weightData.byteLength
            }
        };
    }));
}

async function train() {
    if (trainingPromise) return trainingPromise;

    trainingPromise = (async () => {
        const corpus = readCorpus();
        const pendingAtStart = newSequencesSinceTrain;

        if (trainedRevision === corpus.revision && model) return true;
        if (await loadCheckpoint(corpus.revision)) {
            newSequencesSinceTrain = Math.max(0, newSequencesSinceTrain - pendingAtStart);
            return true;
        }

        const trainingData = buildTrainingData(corpus);
        if (trainingData.examples.length === 0 || trainingData.vocabularyIds.length <= 5) {
            return false;
        }

        await tf.ready();
        const nextTokenModel = createModel(trainingData.vocabularyIds.length);
        const inputs = tf.tensor2d(
            trainingData.examples.map(example => example.input),
            [trainingData.examples.length, CONTEXT_LENGTH],
            'int32'
        );
        const labels = tf.tensor2d(
            trainingData.examples.map(example => [example.target]),
            [trainingData.examples.length, 1],
            'float32'
        );

        try {
            await nextTokenModel.fit(inputs, labels, {
                epochs: EPOCHS,
                batchSize: BATCH_SIZE,
                shuffle: true,
                verbose: 0
            });
        } catch (error) {
            nextTokenModel.dispose();
            throw error;
        } finally {
            inputs.dispose();
            labels.dispose();
        }

        model?.dispose();
        model = nextTokenModel;
        setModelVocabulary(trainingData.vocabularyIds);
        trainedRevision = corpus.revision;
        newSequencesSinceTrain = Math.max(0, newSequencesSinceTrain - pendingAtStart);
        await saveCheckpoint(corpus.revision);
        return true;
    })();

    try {
        return await trainingPromise;
    } finally {
        trainingPromise = null;
        scheduleTraining();
    }
}

function scheduleTraining() {
    if (!model || newSequencesSinceTrain < RETRAIN_EVERY || trainingScheduled) return;

    trainingScheduled = true;
    trainingTimer = setImmediate(() => {
        trainingTimer = null;
        trainingScheduled = false;
        train().catch(error => console.error('AI token model retraining failed:', error));
    });
}

function generateReply(tokens, maxTokens = 24) {
    if (!model || !Array.isArray(tokens) || tokens.length === 0) return [];

    const corpus = readCorpus();
    if (!corpus.sequences.some(sequence => sequence.kind === 'conversation')) return [];

    const idToToken = new Map(
        Object.entries(corpus.vocabulary).map(([token, id]) => [id, token])
    );
    const inputIds = tokens.map(token => corpus.vocabulary[token] ?? 1);
    const context = [
        modelTokenIndexes.get(2) ?? 2,
        ...inputIds.map(id => modelTokenIndexes.get(id) ?? 1),
        modelTokenIndexes.get(4) ?? 4
    ].slice(-CONTEXT_LENGTH);
    const paddedContext = [...Array(CONTEXT_LENGTH - context.length).fill(0), ...context];
    const generated = [];

    for (let index = 0; index < maxTokens; index++) {
        const input = tf.tensor2d([paddedContext], [1, CONTEXT_LENGTH], 'int32');
        const prediction = model.predict(input);

        if (Array.isArray(prediction)) {
            input.dispose();
            prediction.forEach(tensor => tensor.dispose());
            throw new Error('AI token model returned multiple predictions unexpectedly');
        }

        const probabilities = prediction.dataSync();
        let total = 0;
        const weighted = new Float64Array(probabilities.length);

        for (let tokenIndex = 0; tokenIndex < probabilities.length; tokenIndex++) {
            const globalTokenId = modelVocabularyIds[tokenIndex];
            if (globalTokenId === 0 || globalTokenId === 2 || globalTokenId === 4) continue;

            const weight = Math.pow(Math.max(probabilities[tokenIndex], 1e-9), 1 / 0.85);
            weighted[tokenIndex] = weight;
            total += weight;
        }

        prediction.dispose();
        input.dispose();

        if (total === 0) break;

        let choice = Math.random() * total;
        let nextTokenIndex = -1;
        for (let tokenIndex = 0; tokenIndex < weighted.length; tokenIndex++) {
            choice -= weighted[tokenIndex];
            if (choice <= 0 && weighted[tokenIndex] > 0) {
                nextTokenIndex = tokenIndex;
                break;
            }
        }

        if (nextTokenIndex < 0) break;

        const globalTokenId = modelVocabularyIds[nextTokenIndex];
        if (globalTokenId === 3) break;

        const token = idToToken.get(globalTokenId);
        if (token && !Object.values(SPECIAL_TOKENS).includes(token)) generated.push(token);

        paddedContext.push(nextTokenIndex);
        paddedContext.shift();
    }

    return generated;
}

function getStatus() {
    const corpus = readCorpus();
    return {
        sequences: corpus.sequences.length,
        conversations: corpus.sequences.filter(sequence => sequence.kind === 'conversation').length,
        vocabularySize: Object.keys(corpus.vocabulary).length,
        modelReady: Boolean(model)
    };
}

module.exports = {
    addTrainingExamples,
    replaceConversationExample,
    generateReply,
    getStatus,
    train
};
