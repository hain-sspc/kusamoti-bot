{
    const fs = require("fs");
    const kuromoji = require("kuromoji");
    const path = require("path");
    const tokenLanguageModel = require("./tokenLanguageModel");

    const FILE = path.join(__dirname, "..", "data", "txt.json");

    let tokenizer = null;
    let tokenizerReady = false;
    let dbCache = null;
    let dbSaveTimer = null;
    let dbSaveInProgress = false;
    let dbDirty = false;
    let dbRevision = 0;


    // =========================
    // DB
    // =========================
    function loadDB() {
        if (dbCache) return dbCache;

        const data = fs.existsSync(FILE)
            ? JSON.parse(fs.readFileSync(FILE, "utf8") || "{}")
            : {};

        dbCache = {
            ...data,
            sentences: data.sentences || [],
            bigram: data.bigram || {},
            pairs: data.pairs || {},
            emotion: data.emotion || {},
            userMemory: data.userMemory || {},
            posBigram: data.posBigram || {},
            intent: data.intent || {}
        };
        return dbCache;
    }

    function saveDB(data) {
        dbCache = data;
        dbDirty = true;
        dbRevision++;
        if (!dbSaveTimer && !dbSaveInProgress) {
            dbSaveTimer = setTimeout(flushDB, 1000);
        }
    }

    async function flushDB() {
        dbSaveTimer = null;
        if (dbSaveInProgress || !dbDirty) return;

        dbSaveInProgress = true;
        const revision = dbRevision;
        const temporaryFile = `${FILE}.${process.pid}.tmp`;

        try {
            await fs.promises.writeFile(temporaryFile, JSON.stringify(dbCache, null, 2));
            await fs.promises.rename(temporaryFile, FILE);
            if (revision === dbRevision) dbDirty = false;
        } catch (error) {
            console.error("AIデータベースの保存に失敗しました:", error);
            try {
                await fs.promises.unlink(temporaryFile);
            } catch (cleanupError) {
                if (cleanupError.code !== "ENOENT") {
                    console.error("AIデータベース一時ファイルの削除に失敗しました:", cleanupError);
                }
            }
        } finally {
            dbSaveInProgress = false;
            if (dbDirty && !dbSaveTimer) {
                dbSaveTimer = setTimeout(flushDB, 1000);
            }
        }
    }

    function updatePosBigram(db, tokens) {

        for (let i = 0; i < tokens.length - 1; i++) {

            const a = tokens[i].pos;
            const b = tokens[i + 1].pos;

            if (!db.posBigram[a]) {
                db.posBigram[a] = {};
            }

            if (!db.posBigram[a][b]) {
                db.posBigram[a][b] = 0;
            }

            db.posBigram[a][b]++;
        }
    }
    // =========================
    // tokenizer
    // =========================
    function train() {
        return new Promise((resolve, reject) => {
            kuromoji.builder({ dicPath: "node_modules/kuromoji/dict" })
                .build((err, tk) => {
                    if (err) return reject(err);
                    tokenizer = tk;
                    tokenizerReady = true;
                    console.log("kuromoji ready");

                    try {
                        const db = loadDB();
                        const examples = db.sentences
                            .filter(sentence => Array.isArray(sentence.tokens))
                            .map(sentence => ({
                                kind: "message",
                                tokens: sentence.tokens.map(token => token.base)
                            }));

                        for (const [input, replies] of Object.entries(db.pairs || {})) {
                            if (!Array.isArray(replies)) continue;

                            for (const reply of replies) {
                                examples.push({
                                    kind: "conversation",
                                    tokens: parseText(input).map(token => token.base),
                                    replyTokens: parseText(reply).map(token => token.base)
                                });
                            }
                        }

                        tokenLanguageModel.addTrainingExamples(examples);
                        tokenLanguageModel.train().then(() => {
                            const status = tokenLanguageModel.getStatus();
                            console.log(
                                `AI token model ready: ${status.sequences} sequences, ` +
                                `${status.vocabularySize} tokens`
                            );
                            resolve();
                        }, reject);
                    } catch (error) {
                        reject(error);
                    }
                });
        });
    }



    function findBestReply(inputTokens, db) {
        if (!db.pairs) return null;

        const inputWords = new Set(inputTokens.map(token => token.base).filter(Boolean));
        if (inputWords.size === 0) return null;

        let bestScore = 0;
        let bestMatches = [];

        for (const [key, replies] of Object.entries(db.pairs)) {
            if (!Array.isArray(replies)) continue;

            const keyWords = new Set(parseText(key).map(token => token.base).filter(Boolean));
            if (keyWords.size === 0) continue;

            let overlap = 0;
            for (const word of inputWords) {
                if (keyWords.has(word)) overlap++;
            }

            const score = overlap / (inputWords.size + keyWords.size - overlap);
            if (score > bestScore) {
                bestScore = score;
                bestMatches = [replies];
            } else if (score > 0 && score === bestScore) {
                bestMatches.push(replies);
            }
        }

        const replies = bestMatches.flat().filter(reply =>
            typeof reply === "string" && reply.trim().length > 0
        );
        return replies.length > 0
            ? replies[Math.floor(Math.random() * replies.length)]
            : null;
    }

    function analyzeText(input) {
        if (!isReady()) {
            throw new Error("AI tokenizer is not ready");
        }

        const db = loadDB();
        const tokens = parseText(input);
        const inputWords = new Set(tokens.map(token => token.base).filter(Boolean));
        const wordCounts = new Map();

        for (const sentence of db.sentences) {
            if (!Array.isArray(sentence.tokens)) continue;
            for (const token of sentence.tokens) {
                if (token?.base) {
                    wordCounts.set(token.base, (wordCounts.get(token.base) || 0) + 1);
                }
            }
        }

        const pairs = Object.entries(db.pairs)
            .filter(([, replies]) => Array.isArray(replies))
            .map(([text, replies]) => {
                const pairWords = new Set(parseText(text).map(token => token.base).filter(Boolean));
                let overlap = 0;
                for (const word of inputWords) {
                    if (pairWords.has(word)) overlap++;
                }

                return {
                    input: text,
                    replies,
                    score: inputWords.size && pairWords.size
                        ? overlap / (inputWords.size + pairWords.size - overlap)
                        : 0
                };
            })
            .filter(pair => pair.score > 0)
            .sort((left, right) => right.score - left.score)
            .slice(0, 5);

        const tokenStats = tokens.map(token => {
            const emotion = db.emotion[token.base];
            return {
                ...token,
                frequency: wordCounts.get(token.base) || 0,
                emotion: emotion && emotion.count > 0
                    ? emotion.score / emotion.count
                    : null,
                emotionCount: emotion?.count || 0
            };
        });

        const transitions = tokens.slice(0, -1).map((token, index) => {
            const next = tokens[index + 1];
            return {
                from: token.base,
                to: next.base,
                count: db.bigram[token.base]?.[next.base] || 0,
                posFrom: token.pos,
                posTo: next.pos,
                posCount: db.posBigram[token.pos]?.[next.pos] || 0
            };
        });

        return {
            text: input,
            tokens: tokenStats,
            sentenceCount: db.sentences.length,
            exactSentenceCount: db.sentences.filter(sentence => sentence.text === input).length,
            conversationPairCount: Object.values(db.pairs)
                .reduce((total, replies) => total + (Array.isArray(replies) ? replies.length : 0), 0),
            transitions,
            similarPairs: pairs
        };
    }




    function updateUserMemory(db, userId, tokens) {
        if (!db.userMemory[userId]) {
            db.userMemory[userId] = [];
        }

        const words = tokens.map(t => t.base);

        // 最新5発言だけ保持
        db.userMemory[userId].push(words);
        if (db.userMemory[userId].length > 5) {
            db.userMemory[userId].shift();
        }
    }


    function isReady() {
        return tokenizerReady && tokenizer;
    }

    // =========================
    // tokenize
    // =========================
    function parseText(text) {
        if (!tokenizer) return [];

        return tokenizer.tokenize(text).map(t => ({
            base: t.basic_form === "*" ? t.surface_form : t.basic_form,
            pos: t.pos
        }));
    }

    // =========================
    // bigram学習（核心）
    // =========================
    function updateBigram(db, tokens) {
        for (let i = 0; i < tokens.length - 1; i++) {
            const a = tokens[i].base;
            const b = tokens[i + 1].base;

            if (!a || !b) continue;

            if (!db.bigram[a]) db.bigram[a] = {};
            if (!db.bigram[a][b]) db.bigram[a][b] = 0;

            db.bigram[a][b] += 1;
        }
    }

    function detectEmotionFromDB(db, tokens) {
        let total = 0;
        let count = 0;

        for (const t of tokens) {
            const w = t.base;

            if (db.emotion[w]) {
                total += db.emotion[w].score / db.emotion[w].count;
                count++;
            }
        }

        if (count === 0) return 0;

        return total / count;
    }


    // =========================
    // 学習
    // =========================
    function learn(input, userId = "global") {
        if (!isReady()) return console.log("not ready");

        const db = loadDB();
        const tokens = parseText(input);

        if (tokens.length < 2) return;

        updateUserMemory(db, userId, tokens);



        db.sentences.push({
            id: db.sentences.length,
            text: input,
            tokens
        });

        updateBigram(db, tokens);
        updatePosBigram(db, tokens);

        if (!db.pairs) db.pairs = {};

        // =========================
        // 🔥 感情スコア（伝染型）
        // =========================

        const emotionScore = detectEmotionFromDB(db, tokens);

        if (!db.emotion) db.emotion = {};

        const spread = emotionScore * 0.3;

        for (let i = 0; i < tokens.length; i++) {

            const t = tokens[i];

            if (
                t.pos !== "名詞" &&
                t.pos !== "動詞" &&
                t.pos !== "形容詞"
            ) continue;

            const w = t.base;

            if (!db.emotion[w]) {
                db.emotion[w] = { score: 0, count: 0 };
            }

            // 🟢 本体に加算
            db.emotion[w].score += spread;
            db.emotion[w].count += 1;

            // =========================
            // 🔥 伝染（前後の単語）
            // =========================
            const neighbors = [
                tokens[i - 1]?.base,
                tokens[i + 1]?.base
            ];

            for (const n of neighbors) {
                if (!n) continue;

                if (!db.emotion[n]) {
                    db.emotion[n] = { score: 0, count: 0 };
                }

                // 👉 伝染は弱めに
                db.emotion[n].score += spread * 0.5;
                db.emotion[n].count += 1;
            }

            // =========================
            // 🔥 bigram伝染（強い）
            // =========================
            const nextMap = db.bigram[w];
            if (nextMap) {
                for (const nextWord of Object.keys(nextMap)) {

                    if (!db.emotion[nextWord]) {
                        db.emotion[nextWord] = { score: 0, count: 0 };
                    }

                    db.emotion[nextWord].score += spread * 0.3;
                    db.emotion[nextWord].count += 1;
                }
            }
        }

        saveDB(db);
        tokenLanguageModel.addTrainingExamples([{
            kind: "message",
            tokens: tokens.map(token => token.base)
        }]);
    }


    function buildWordPosMap(db) {

        const map = {};

        for (const s of db.sentences) {

            for (const t of s.tokens) {

                if (!map[t.pos]) {
                    map[t.pos] = [];
                }

                map[t.pos].push(t.base);
            }
        }

        return map;
    }

    function predictNextPos(db, currentPos) {

        const nexts = db.posBigram[currentPos];
        if (!nexts) return null;

        let best = null;
        let max = 0;

        for (const pos of Object.keys(nexts)) {

            if (nexts[pos] > max) {
                max = nexts[pos];
                best = pos;
            }
        }

        return best;
    }
    function getWordEmotion(db, word) {
        if (!db.emotion || !db.emotion[word]) return 0;

        const d = db.emotion[word];
        return d.score / d.count;
    }
    // =========================
    // ランダム開始
    // =========================
    function randomWord(db) {
        const keys = Object.keys(db.bigram);
        if (keys.length === 0) return null;
        return keys[Math.floor(Math.random() * keys.length)];
    }


    function buildUserContext(db, userId) {
        const mem = db.userMemory[userId];
        if (!mem) return [];

        return mem.flat(); // 全単語まとめる
    }

    function isBad(text) {
        if (!text) return true;
        if (text.length < 3) return true;
        if (/[0-9]/.test(text)) return true;
        return false;
    }

    function hasLearnedWordTransitions(text, db) {
        const tokens = parseText(text);
        if (tokens.length < 3) return true;

        let learnedTransitions = 0;
        for (let i = 0; i < tokens.length - 1; i++) {
            if (db.bigram[tokens[i].base]?.[tokens[i + 1].base] > 0) {
                learnedTransitions++;
            }
        }

        return learnedTransitions / (tokens.length - 1) >= 0.25;
    }

    // =========================
    // 生成（重み付きマルコフ）
    // =========================
    function generate(startWord, contextWords = [], targetEmotion = 0) {

        const db = loadDB();
        const wordPosMap = buildWordPosMap(db);

        let current = startWord || randomWord(db);
        if (!current) return "";

        let currentPos = "名詞";

        const result = [current];

        const maxLen = 10;

        for (let i = 0; i < maxLen; i++) {

            const nextPos = predictNextPos(db, currentPos);

            if (!nextPos) break;

            const candidates = wordPosMap[nextPos];
            if (!candidates || candidates.length === 0) break;

            let weighted = [];

            for (const word of candidates) {

                if (!isValidWord(word)) continue;

                let score = 1;

                // 文脈ボーナス
                if (contextWords.includes(word)) {
                    score *= 2;
                }

                // 感情一致
                const emo = getWordEmotion(db, word);
                score *= (1 - Math.abs(targetEmotion - emo));

                // 助詞強化
                if (nextPos === "助詞") {
                    score *= 2.5;
                }

                weighted.push([word, score]);
            }

            if (weighted.length === 0) break;

            const total = weighted.reduce((a, b) => a + b[1], 0);

            let r = Math.random() * total;

            let next = null;

            for (const [word, score] of weighted) {

                r -= score;

                if (r <= 0) {
                    next = word;
                    break;
                }
            }

            if (!next) break;

            result.push(next);

            current = next;
            currentPos = nextPos;

            // 文末
            if (
                next === "です" ||
                next === "ます"
            ) {
                break;
            }
        }

        return fixSentence(result.join(""));
    }
    // =========================
    // smart生成
    function generateSmart(input, userId = "global") {

        const db = loadDB();
        const clean = cleanInput(input);
        const tokens = parseText(clean);

        if (tokens.length === 0) return "なるほどね";

        // =========================
        // 🔥 ① ペア応答
        // =========================
        const reply = findBestReply(tokens, db);
        if (reply && Math.random() < 0.3) return reply;

        const tokenReply = tokenLanguageModel.generateReply(tokens.map(token => token.base));
        if (tokenReply.length > 0) {
            const neuralReply = fixSentence(tokenReply.join(""));
            if (!isBad(neuralReply) && hasLearnedWordTransitions(neuralReply, db)) {
                return neuralReply;
            }
        }

        // =========================
        // 🔥 ② 生成（最後）
        // =========================
        let emotion = detectEmotionFromDB(db, tokens);

        if (Math.abs(emotion) < 0.05) {
            emotion = (Math.random() - 0.5) * 0.2;
        }

        const keywords = extractKeywords(tokens);
        const userContext = buildUserContext(db, userId);
        const context = buildContext(db, keywords);

        const start = keywords[0] || randomWord(db);

        let gen = generate(start, [...context, ...userContext], emotion);

        if (isBad(gen) || !hasLearnedWordTransitions(gen, db)) return "なるほどね";

        return gen;
    }
    // =========================
    // クレンジング
    // =========================
    function cleanInput(text) {
        if (!text) return "";

        return text
            .replace(/https?:\/\/\S+/g, "")
            .replace(/[0-9]{6,}/g, "") // ← 長い数字削除
            .replace(/[^\wぁ-んァ-ン一-龥\s]/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }


    async function learnPair(userText, botText) {
        const db = loadDB();

        const u = parseText(userText);
        const b = parseText(botText);

        if (u.length === 0 || b.length === 0) return;

        const previousReplies = Array.isArray(db.pairs[userText])
            ? db.pairs[userText]
            : [];
        const firstInputToken = u[0].base;
        for (const previousReply of previousReplies) {
            const previousReplyTokens = parseText(previousReply);
            if (previousReplyTokens.length === 0) continue;

            const firstReplyToken = previousReplyTokens[0].base;
            const previousCount = db.bigram[firstInputToken]?.[firstReplyToken] || 0;
            if (previousCount >= 5) {
                const remainingCount = previousCount - 5;
                if (remainingCount > 0) {
                    db.bigram[firstInputToken][firstReplyToken] = remainingCount;
                } else if (db.bigram[firstInputToken]) {
                    delete db.bigram[firstInputToken][firstReplyToken];
                    if (Object.keys(db.bigram[firstInputToken]).length === 0) {
                        delete db.bigram[firstInputToken];
                    }
                }
            }
        }

        db.pairs[userText] = [botText];
        const firstReplyToken = b[0].base;
        if (!db.bigram[firstInputToken]) db.bigram[firstInputToken] = {};
        db.bigram[firstInputToken][firstReplyToken] =
            (db.bigram[firstInputToken][firstReplyToken] || 0) + 5;

        saveDB(db);
        return tokenLanguageModel.replaceConversationExample(
            u.map(token => token.base),
            b.map(token => token.base)
        );
    }

    function extractKeywords(tokens) {
        return tokens
            .filter(t =>
                t.pos === "名詞" ||
                t.pos === "動詞" ||
                t.pos === "形容詞"
            )
            .map(t => t.base);
    }

    const PARTICLES = ["は", "が", "を", "に", "で", "と", "も", "の", "へ", "や", "から", "まで"];
    const ENDINGS = ["です", "ます", "だよ", "だね", "だな", "かな", "かも", "よ", "ね", "。"];

    function isValidWord(word) {
        if (!word) return false;

        // 日本語のみ
        if (!/^[ぁ-んァ-ン一-龥ー]+$/.test(word)) return false;

        // 1文字は助詞だけ許可
        if (word.length === 1 && !PARTICLES.includes(word)) return false;

        return true;
    }

    function fixSentence(text) {

        if (!text) return "";

        text = text.replace(/(.)\1{2,}/g, "$1");

        text = text.replace(/(は|が|を|に|で|と)\1+/g, "$1");

        // 名詞終わり補正
        if (/^[ぁ-んァ-ン一-龥ー]+$/.test(text.slice(-2))) {
            text += "";
        }

        // 文末記号
        if (!/[。！？]$/.test(text)) {
            text += "。";
        }

        return text;
    }

    function buildContext(db, keywords) {
        const context = [];

        for (const word of keywords) {
            const nexts = db.bigram[word];
            if (!nexts) continue;

            for (const w of Object.keys(nexts)) {
                context.push(w);
            }
        }

        return context;
    }

    // =========================
    // export
    // =========================
    module.exports = {
        train,
        learn,
        generate,
        generateSmart,
        cleanInput,
        isReady,
        learnPair,
        analyzeText
    };

}