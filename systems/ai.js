{
    const fs = require("fs");
    const kuromoji = require("kuromoji");
    const path = require("path");

    const FILE = path.join(__dirname, "..", "data", "txt.json");

    let tokenizer = null;
    let tokenizerReady = false;


    // =========================
    // DB
    // =========================
    function loadDB() {
        if (!fs.existsSync(FILE)) {
            return { sentences: [], bigram: {} };
        }

        const raw = fs.readFileSync(FILE, "utf8") || "{}";
        const data = JSON.parse(raw);

        return {
            sentences: data.sentences || [],
            bigram: data.bigram || {},
            pairs: data.pairs || {},
            emotion: data.emotion || {},
            userMemory: data.userMemory || {},
            posBigram: data.posBigram || {},
            intent: data.intent || {} // 🔥追加
        };
    }

    function saveDB(data) {
        fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
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
                    resolve();
                });
        });
    }



    function findBestReply(input, db) {
        if (!db.pairs) return null;

        let best = null;
        let bestScore = 0;

        for (const key of Object.keys(db.pairs)) {

            let score = 0;

            const inputWords = input.split(" ");
            const keyWords = key.split(" ");

            for (const w of inputWords) {
                if (keyWords.includes(w)) score++;
            }

            if (score > bestScore) {
                bestScore = score;

                const replies = db.pairs[key];
                best = replies[Math.floor(Math.random() * replies.length)];
            }
        }

        return bestScore > 0 ? best : null;
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


    function learnIntent(db, tokens, intent) {

        if (!db.intent[intent]) {
            db.intent[intent] = {};
        }

        for (const t of tokens) {
            const w = t.base;

            if (!db.intent[intent][w]) {
                db.intent[intent][w] = 0;
            }

            db.intent[intent][w] += 1; // 重み加算
        }
    }
    // =========================
    // 学習
    // =========================
    let lastUserMessage = null; // 🔥 追加（ファイルの上に置く）



    function learn(input, userId = "global") {
        if (!isReady()) return console.log("not ready");

        const db = loadDB();
        const tokens = parseText(input);

        if (tokens.length < 2) return;

        const text = tokens.map(t => t.base).join("");
        const intent = classify(text);

        if (intent !== "other") {
            learnIntent(db, tokens, intent);
        }
        updateUserMemory(db, userId, tokens);



        db.sentences.push({
            id: db.sentences.length,
            text: input,
            tokens
        });

        updateBigram(db, tokens);
        updatePosBigram(db, tokens);

        if (!db.pairs) db.pairs = {};

        if (lastUserMessage) {
            if (!db.pairs[lastUserMessage]) {
                db.pairs[lastUserMessage] = [];
            }
            db.pairs[lastUserMessage].push(input);
        }

        // =========================
        // 🔥 感情スコア（伝染型）
        // =========================

        let emotionScore = detectEmotionFromDB(db, tokens);

        // 初期ブースト（完全ゼロ防止）
        if (Math.abs(emotionScore) < 0.05) {
            emotionScore = (Math.random() - 0.5) * 0.2;
        }

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

        console.log("emotionDB:");

        lastUserMessage = input;

        saveDB(db);
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

    function classify(text) {
        if (text.includes("おはよう")) return "morning";
        if (text.includes("こんにちは")) return "noon";
        if (text.includes("こんばんは")) return "night";

        if (text.includes("眠い")) return "sleepy";
        if (text.includes("暑い")) return "hot";
        if (text.includes("疲れた")) return "tired";

        return "other";
    }

    function controlReply(type) {

        const map = {
            morning: ["おはよ", "おはよう"],
            noon: ["こんにちは"],
            night: ["こんばんは"],

            sleepy: ["寝た方がいい", "無理するな"],
            hot: ["水分とって休憩しよう"],
            tired: ["無理せず休もう"]
        };

        if (!map[type]) return null;

        const arr = map[type];
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function isBad(text) {
        if (!text) return true;
        if (text.length < 3) return true;
        if (/[0-9]/.test(text)) return true;
        return false;
    }

    function classifyNN(db, tokens) {

        const scores = {};

        for (const intent of Object.keys(db.intent || {})) {

            scores[intent] = 0;

            for (const t of tokens) {
                const w = t.base;

                if (db.intent[intent][w]) {
                    scores[intent] += db.intent[intent][w];
                }
            }
        }

        let best = "other";
        let max = 0;

        for (const k of Object.keys(scores)) {
            if (scores[k] > max) {
                max = scores[k];
                best = k;
            }
        }

        return best;
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

        const text = tokens.map(t => t.base).join("");

        // =========================
        // 🔥 ① 意図分類
        // =========================
        const type = classifyNN(db, tokens);

        // =========================
        // 🔥 ② 制御（最優先）
        // =========================
        const control = controlReply(type, text);
        if (control) return control;

        // =========================
        // 🔥 ③ ペア応答
        // =========================
        const reply = findBestReply(clean, db);
        if (reply && Math.random() < 0.3) return reply;

        // =========================
        // 🔥 ④ 生成（最後）
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

        // =========================
        // 🔥 ⑤ フィルター
        // =========================
        if (isBad(gen)) return "なるほどね";

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


    function learnPair(userText, botText) {
        const db = loadDB();

        const u = parseText(userText);
        const b = parseText(botText);

        if (u.length === 0 || b.length === 0) return;

        const u0 = u[0].base;
        const b0 = b[0].base;

        if (!db.bigram[u0]) db.bigram[u0] = {};
        if (!db.bigram[u0][b0]) db.bigram[u0][b0] = 0;

        db.bigram[u0][b0] += 5; // 会話重み強め

        saveDB(db);
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
        learnPair
    };

}