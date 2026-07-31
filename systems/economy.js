
const fs = require('fs');
const path = require('path');

// =========================
// パス
// =========================
const DATA_DIR = path.join(__dirname, '../data');
const ECONOMY_PATH = path.join(DATA_DIR, 'economy.json');
const COIN_CONFIG_PATH = path.join(DATA_DIR, 'coin_config.json');

// =========================
// 初期データ
// =========================
const DEFAULT_ECONOMY = {
    users: {}
};

const DEFAULT_COIN_CONFIG = {};

// =========================
// 共通
// =========================
function ensureDataFolder() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function loadJson(filePath, defaultData) {
    ensureDataFolder();

    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
            return JSON.parse(JSON.stringify(defaultData));
        }

        const raw = fs.readFileSync(filePath, 'utf8');

        if (!raw.trim()) {
            fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
            return JSON.parse(JSON.stringify(defaultData));
        }

        return JSON.parse(raw);

    } catch (err) {
        console.error(`[ERROR] JSON破損: ${ filePath } `);
        console.error(err);

        try {
            fs.renameSync(filePath, `${ filePath }.bak.${ Date.now() } `);
        } catch {}

        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));

        return JSON.parse(JSON.stringify(defaultData));
    }
} 

function saveJson(filePath, data) {
    ensureDataFolder();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// =========================
// economy
// =========================
function loadEconomy() {
    return loadJson(ECONOMY_PATH, DEFAULT_ECONOMY);
}

function saveEconomy(economy) {
    saveJson(ECONOMY_PATH, economy);
}

// =========================
// coin config
// =========================
function loadCoinConfig() {
    return loadJson(COIN_CONFIG_PATH, DEFAULT_COIN_CONFIG);
}

function saveCoinConfig(config) {
    saveJson(COIN_CONFIG_PATH, config);
}

// =========================
// ユーザー取得
// =========================
function getUser(economy, userId) {
    userId = String(userId);

    if (!economy.users) {
        economy.users = {};
    }

    if (!economy.users[userId]) {
        economy.users[userId] = {
            wallet: {},
            createdAt: Date.now()
        };
    }

    return economy.users[userId];
}

function getDefaultCoin(economy, userId) {

    const user = getUser(
        economy,
        userId
    );

    return user.defaultCoin || null;
}

function setDefaultCoin(
    economy,
    userId,
    coinId
) {

    const user = getUser(
        economy,
        userId
    );

    user.defaultCoin =
        String(coinId).toUpperCase();
}

// =========================
// コイン取得
// =========================
function getCoin(coinId) {
    const config = loadCoinConfig();
    return config[coinId] || null;
}

function getCoinName(coinId) {
    return getCoin(coinId)?.name || null;
}
function getAllCoins() {
    return loadCoinConfig();
}

// =========================
// コイン作成
// =========================
function createCoin({
    coinId,
    name,
    ownerId,
    supply = 0,
    maxSupply = null
}) {
    const config = loadCoinConfig();

    coinId = String(coinId).toUpperCase();

    if (config[coinId]) {
        return {
            success: false,
            message: 'そのコインIDは既に存在します。'
        };
    }

    config[coinId] = {
        name,
        ownerId: String(ownerId),
        supply,
        maxSupply,
        createdAt: Date.now()
    };

    saveCoinConfig(config);

    return {
        success: true,
        message: `${ coinId } を作成しました。`
    };
}

// =========================
// 残高取得
// =========================
function getBalance(economy, userId, coinId) {
    const user = getUser(economy, userId);

    coinId = String(coinId).toUpperCase();

    return user.wallet[coinId] || 0;
}

// =========================
// 残高追加
// =========================
function addBalance(economy, userId, coinId, amount) {
    const user = getUser(economy, userId);

    coinId = String(coinId).toUpperCase();
 
    const config = loadCoinConfig();

    const coin = config[coinId];

    coin.supply = Number(
        (
            coin.supply + amount
        ).toFixed(10)
    );
    if (!user.wallet[coinId]) {
        user.wallet[coinId] = 0;
    }
    saveCoinConfig(config);

    user.wallet[coinId] += amount;

    return user.wallet[coinId];
}

// =========================
// 送金
// =========================
function transfer(economy, fromUserId, toUserId, coinId, amount) {
    amount = Number(amount);

    if (isNaN(amount) || amount <= 0) {
        return {
            success: false,
            message: '無効な金額です。'
        };
    }

    const fromBalance = getBalance(economy, fromUserId, coinId);

    if (fromBalance < amount) {
        return {
            success: false,
            message: '残高不足です。'
        };
    }

    addBalance(economy, fromUserId, coinId, -amount);
    addBalance(economy, toUserId, coinId, amount);

    return {
        success: true,
        message: `${ amount } ${ coinId } を送金しました。`
    };
}

// =========================
// 発行量変更
// =========================


// =========================
// 全ウォレット取得
// =========================
function getWallet(economy, userId) {
    const user = getUser(economy, userId);
    return user.wallet;
}


const DATA_PATH = path.join(__dirname, '../data/workrole.json');


function workrole(guildId) {
    if (!fs.existsSync(DATA_PATH)) return null;

    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const json = JSON.parse(raw);

    return json[guildId] || null;
}


// =========================
// exports
// =========================
module.exports = {
    loadEconomy,
    saveEconomy,

    loadCoinConfig,
    saveCoinConfig,
    getCoinName,
    getUser,
    
    createCoin,
    getCoin,
    getAllCoins,
    getDefaultCoin,
    setDefaultCoin,
    getBalance,
    getWallet,

    addBalance,
    workrole,
    transfer
};
