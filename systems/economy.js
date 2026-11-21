const fs = require('fs');
const path = require('path');
const io = require('./io');
const ECONOMY_PATH = path.join(__dirname, '../data/economy.json');
const COIN_CONFIG_PATH = path.join(__dirname, '../data/coin_config.json');
const DATA_PATH = path.join(__dirname, '../data/workrole.json');
const DEFAULT_ECONOMY = { guilds: {} };
const DEFAULT_COIN_CONFIG = {};
const TAX_PATH = path.join(__dirname, '../data/tax.json');
const IO_PATH = path.join(__dirname, '../data/io.json');
function loadJson(filePath, defaultData) {
    try {
        if (!fs.existsSync(filePath)) {
            io.writeJsonSync(filePath, defaultData);
            return JSON.parse(JSON.stringify(defaultData));
        }
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (typeof data !== 'object' || data === null) return JSON.parse(JSON.stringify(defaultData));
        // guildsキーがないなら初期化
        if (!data.guilds) data.guilds = {};
        return data;
    } catch {
        io.renameSync(filePath, filePath + `.bak.${Date.now()}`);
        io.writeJsonSync(filePath, defaultData);
        return JSON.parse(JSON.stringify(defaultData));
    }
}


function saveJson(filePath, data) {
    io.writeJsonSync(filePath, data);
}

function loadEconomy() {
    return loadJson(ECONOMY_PATH, DEFAULT_ECONOMY);
    console.log("eco:", eco);
    console.log("eco.guilds:", eco.guilds);
}

function saveEconomy(eco) {
    saveJson(ECONOMY_PATH, eco);
}

function loadCoinConfig() {
    return loadJson(COIN_CONFIG_PATH, DEFAULT_COIN_CONFIG);
}

function saveCoinConfig(config) {
    saveJson(COIN_CONFIG_PATH, config);
}

function getGuildData(eco, guildId) {
    if (!eco.guilds) {
        eco.guilds = {};
    }
    if (!eco.guilds[guildId]) {
        eco.guilds[guildId] = {
            totalCoins: 0,
            totalBalance: 0,
            users: {},
            tax: 0
        };
    }
    return eco.guilds[guildId];
}



function getUserEc(eco, guildId, userId) {
    const guild = getGuildData(eco, guildId);
    if (!guild.users[userId]) {
        guild.users[userId] = {
            balance: 0,
            coins: 0,
            debt: 0,
            foreignBalance: {},
            bank: {
                deposit: 0,
                lastInterest: Date.now()
            },
        };
    }
    return guild.users[userId];
}

function serverbankbalance(eco, guildId) {
    const guild = getGuildData(eco, guildId);
    if (!guild?.users) return [];

    return Object.entries(guild.users).map(([userId, data]) => ({
        userId,
        deposit: data.bank?.deposit ?? 0
    }));
}


function bankbalance(eco, guildId, userId) {
    return getUserEc(eco, guildId, userId).bank.deposit;
}

function addBalance(eco, guildId, userId, amount) {
    const gId = String(guildId);
    const uId = String(userId);

    // サーバー初期化
    eco.guilds[gId] = eco.guilds[gId] || { totalBalance: 0, users: {} };

    // ユーザー初期化
    eco.guilds[gId].users[uId] = eco.guilds[gId].users[uId] || {
        balance: 0,
        coins: 0,
        debt: 0,
        foreignBalance: {},
        bank: { deposit: 0, lastInterest: Date.now() }
    };

    // 残高加算
    eco.guilds[gId].users[uId].balance += amount;
    eco.guilds[gId].totalBalance += amount;
}


function getBalance(eco, guildId, userId) {
    return getUserEc(eco, guildId, userId).balance;
}

function buyCoins(eco, guildId, userId, amount, pricePerCoin) {
    const guild = getGuildData(eco, guildId);
    const user = getUserEc(eco, guildId, userId);
    const cost = amount * pricePerCoin;

    if (user.balance < cost) {
        return { success: false, message: 'Not enough balance.' };
    }

    user.balance -= cost;
    user.coins += amount;
    guild.totalCoins += amount;

    return { success: true, message: `${amount} coins purchased.` };
}

function sellCoins(eco, guildId, userId, amount, pricePerCoin) {
    const guild = getGuildData(eco, guildId);
    const user = getUserEc(eco, guildId, userId);

    if (user.coins < amount) {
        return { success: false, message: 'Not enough coins.' };
    }

    const revenue = amount * pricePerCoin;
    user.coins -= amount;
    user.balance += revenue;
    guild.totalCoins -= amount;

    return { success: true, message: `${amount} coins sold for ${revenue} balance.` };
}

function tradeBetweenGuilds(eco, fromGuildId, toGuildId, amount) {
    const fromGuild = getGuildData(eco, fromGuildId);
    const toGuild = getGuildData(eco, toGuildId);

    if (fromGuild.totalCoins <= 0 || toGuild.totalCoins <= 0) {
        return { success: false, message: 'Invalid trade: one of the coins has no supply.' };
    }

    const ratio = toGuild.totalCoins / fromGuild.totalCoins;
    const receivedAmount = amount * ratio;

    fromGuild.totalCoins -= amount;
    toGuild.totalCoins += receivedAmount;

    return {
        success: true,
        fromAmount: amount,
        toAmount: receivedAmount.toFixed(2),
        message: `${amount} ${getCoinName(fromGuildId)} → ${receivedAmount.toFixed(2)} ${getCoinName(toGuildId)}`
    };
}

function exchangeCoins(eco, fromGuildId, toGuildId, userId, amount) {
    const fromGuild = getGuildData(eco, fromGuildId);
    const toGuild = getGuildData(eco, toGuildId);
    const user = getUserEc(eco, fromGuildId, userId);

    if (user.balance < amount) {
        return {
            success: false,
            message: `残高が足りません。${amount} ${getCoinName(fromGuildId)}を交換するには${amount}の残高が必要です。`
        };
    }

    const fromValue = fromGuild.totalBalance || 1;
    const toValue = toGuild.totalBalance || 1;
    const ratio = toValue / fromValue;
    const receivedAmount = amount * ratio;

    user.balance -= amount;
    fromGuild.totalBalance -= amount;

    if (!user.foreignBalance) user.foreignBalance = {};
    user.foreignBalance[toGuildId] = (user.foreignBalance[toGuildId] || 0) + receivedAmount;

    toGuild.totalBalance -= receivedAmount;

    return {
        success: true,
        message: `交換完了！\n• 支払: ${amount} ${getCoinName(fromGuildId)}\n• 受取: ${receivedAmount.toFixed(2)} ${getCoinName(toGuildId)}（レート: ${ratio.toFixed(3)}）`
    };
}

function updateGuildTotalBalanceAsCoins(eco) {
    for (const guildId in eco.guilds) {
        const guild = eco.guilds[guildId];
        let totalBalance = 0;

        for (const userId in guild.users) {
            const user = guild.users[userId];

            // 安全チェック：null/undefined の可能性に備える
            if (!user || user.balance == null) {
                console.warn(`[WARN] 無効なユーザーデータ: guildId=${guildId}, userId=${userId}`);
                continue;
            }

            const balance = Number(user.balance);
            if (!isNaN(balance) && balance >= 0) {
                totalBalance += balance;
            }
        }

        guild.totalBalance = totalBalance;
    }

    console.log(`[${new Date().toLocaleTimeString()}] Guildごとの残高合計を totalBalance に記録しました。`);
}


function repayDebt(eco, guildId, userId, amount) {
    const user = getUserEc(eco, guildId, userId);

    user.balance = Number(user.balance) || 0;
    user.debt = Number(user.debt) || 0;

    if (user.debt <= 0) {
        return { success: false, message: '借金はありません。' };
    }

    if (amount <= 0) {
        return { success: false, message: '返済額は正の数で指定してください。' };
    }

    if (user.balance < amount) {
        return { success: false, message: `残高不足です。所持金: ${user.balance}` };
    }

    const repayAmount = Math.min(amount, user.debt);

    user.balance -= repayAmount;
    user.debt -= repayAmount;

    return { success: true, message: `${repayAmount} を返済しました。残りの借金: ${user.debt}` };
}

function addServerTax(eco, guildId, amount) {
    // guildデータ取得
    const guild = getGuildData(eco, guildId);

    // taxフィールド初期化
    if (typeof guild.tax !== 'number') guild.tax = 0;

    // 税額を加算
    guild.tax += amount;

    const io = loadio(guildId);

    if (amount >= 0) {
        io.in += amount;
    } else {
        io.out += -amount; // ←ここ重要
    }

    saveio(guildId, io.in, io.out);

    return guild.tax;
}

function setCoinName(guildId, coinName) {
    const config = loadCoinConfig();
    config[guildId] = coinName;
    saveCoinConfig(config);
}

function getCoinName(guildId) {
    const config = loadCoinConfig();
    return config[guildId] || null;
}

function isCoinEnabled(guildId) {
    const config = loadCoinConfig();
    return !!config[guildId];
}

function loadTaxRate() {
    try {
        if (!fs.existsSync(TAX_PATH)) return {};
        const raw = fs.readFileSync(TAX_PATH, 'utf8');
        if (!raw.trim()) return {};
        return JSON.parse(raw);
    } catch {
        return {};
    }
}
function saveTaxRate(data) {
    io.writeJsonSync(TAX_PATH, data);
}
/**
 * サーバー間のコイン交換レートを計算
 * @param {number} fromSupply - 交換元の総発行量
 * @param {number} toSupply - 交換先の総発行量
 * @param {number} fromDemand - 交換元の需要指数
 * @param {number} toDemand - 交換先の需要指数
 * @param {number} demandMultiplier - 需要の影響倍率（デフォルト0.3）
 * @returns {number} - 1コインあたりの交換レート
 */
function calculateRate(
    fromSupply,
    toSupply,
    fromDemandPercent,
    toDemandPercent,
    demandMultiplier = 3
) {
    fromSupply = Math.max(fromSupply, 1);
    toSupply = Math.max(toSupply, 1);

    const fromBasePrice = 1 / fromSupply;
    const toBasePrice = 1 / toSupply;

    const fromPrice =
        fromBasePrice * (1 + fromDemandPercent * demandMultiplier);

    const toPrice =
        toBasePrice * (1 + toDemandPercent * demandMultiplier);

    return fromPrice / toPrice;
}





function workrole(guildId) {
    if (!fs.existsSync(DATA_PATH)) return null;

    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const json = JSON.parse(raw);

    return json[guildId] || null;
}


function steprole(guildId, roleId, amount) {

    // ファイルが無ければ作る
    if (!fs.existsSync(DATA_PATH)) {
        io.writeJsonSync(DATA_PATH, {});
    }

    // 読み込み
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const json = JSON.parse(raw);

    // guildが無ければ作成
    if (!json[guildId]) {
        json[guildId] = { roles: {} };
    }

    // rolesが無ければ作成
    if (!json[guildId].roles) {
        json[guildId].roles = {};
    }

    // 登録（上書き）
    json[guildId].roles[roleId] = amount;

    // 保存
    io.writeJsonSync(DATA_PATH, json);

    return true;
}




let iodata = {};

// ディレクトリ作成を保証
function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[IO] ディレクトリ作成: ${dir}`);
    }
}

// 起動時に全体ロード
function loadAllIO() {
    try {
        if (!fs.existsSync(IO_PATH)) {
            ensureDir(IO_PATH);
            io.writeJsonSync(IO_PATH, {});
            console.log(`[IO] ファイル作成: ${IO_PATH}`);
        }

        const raw = fs.readFileSync(IO_PATH, 'utf8');
        if (!raw.trim()) iodata = {};
        else iodata = JSON.parse(raw);

        console.log(`[IO] 全体ロード成功: ${JSON.stringify(iodata)}`);
    } catch (err) {
        iodata = {};
        console.error(`[IO] 全体ロード失敗: ${err}`);
    }
}

// ギルド単位でロード
function loadio(guildId) {
    if (!iodata[guildId]) {
        iodata[guildId] = { in: 0, out: 0 };
        console.log(`[IO] ギルド初期化: ${guildId}`);
    } else {
        console.log(`[IO] ギルドロード: ${guildId}, 値: ${JSON.stringify(iodata[guildId])}`);
    }
    return iodata[guildId];
}

// ギルド単位で保存
function saveio(guildId, inValue, outValue) {
    if (!iodata[guildId]) iodata[guildId] = { in: 0, out: 0 };

    console.log(`[IO] ギルド保存前: ${guildId}, 値: ${JSON.stringify(iodata[guildId])}`);
    iodata[guildId].in = inValue;
    iodata[guildId].out = outValue;
    console.log(`[IO] ギルド保存後: ${guildId}, 新値: ${JSON.stringify(iodata[guildId])}`);

    ensureDir(IO_PATH); // ディレクトリ作成
    try {
        io.writeJsonSync(IO_PATH, iodata);
        console.log(`[IO] ファイル保存成功: ${IO_PATH}`);
    } catch (err) {
        console.error(`[IO] ファイル保存失敗: ${err}`);
    }
}



module.exports = {
    loadEconomy,
    saveEconomy,
    getGuildData,
    getUserEc,
    addBalance,
    getBalance,
    buyCoins,
    sellCoins,
    tradeBetweenGuilds,
    setCoinName,
    getCoinName,
    isCoinEnabled,
    exchangeCoins,
    updateGuildTotalBalanceAsCoins,
    repayDebt,
    addServerTax,
    loadTaxRate,
    saveTaxRate,
    bankbalance,
    serverbankbalance,
    calculateRate,
    workrole,
    steprole, 
    loadio, 
    saveio,
    loadAllIO
}