const fs = require('fs');
const path = require('path');

const ECONOMY_PATH = path.join(__dirname, 'economy.json');
const COIN_CONFIG_PATH = path.join(__dirname, 'coin_config.json');
const DEFAULT_ECONOMY = { guilds: {} };
const DEFAULT_COIN_CONFIG = {};

function loadJson(filePath, defaultData) {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
            return JSON.parse(JSON.stringify(defaultData));
        }
        return Object.assign({}, defaultData, JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch {
        fs.renameSync(filePath, filePath + `.bak.${Date.now()}`);
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
        return JSON.parse(JSON.stringify(defaultData));
    }
}

function saveJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadEconomy() {
    return loadJson(ECONOMY_PATH, DEFAULT_ECONOMY);
}

function saveEconomy(eco) {
    saveJson(ECONOMY_PATH, eco);
}

function getGuildData(eco, guildId) {
    if (!eco.guilds[guildId]) {
        eco.guilds[guildId] = {
            totalCoins: 0,
            users: {}
        };
    }
    return eco.guilds[guildId];
}

function getUserEc(eco, guildId, userId) {
    const guild = getGuildData(eco, guildId);
    if (!guild.users[userId]) {
        guild.users[userId] = {
            balance: 0,
            coins: 0
        };
    }
    return guild.users[userId];
}

function loadCoinConfig() {
    return loadJson(COIN_CONFIG_PATH, DEFAULT_COIN_CONFIG);
}

function saveCoinConfig(config) {
    saveJson(COIN_CONFIG_PATH, config);
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

function addBalance(guildId, userId, amount) {
    const eco = loadEconomy();
    const user = getUserEc(eco, guildId, userId);

    // balance が未定義または数値でない場合の保護処理
    user.balance = Number(user.balance) || 0;
    user.balance += amount;

    saveEconomy(eco);
}


function getBalance(guildId, userId) {
    const eco = loadEconomy();
    return getUserEc(eco, guildId, userId).balance;
}
function buyCoins(guildId, userId, amount, pricePerCoin) {
    const eco = loadEconomy();
    const guild = getGuildData(eco, guildId);
    const user = getUserEc(eco, guildId, userId);

    const cost = amount * pricePerCoin;
    if (user.balance < cost) {
        return { success: false, message: 'Not enough balance.' };
    }

    user.balance -= cost;
    user.coins += amount;
    guild.totalCoins += amount;  // 購入後のコイン総量を増加

    saveEconomy(eco);
    return { success: true, message: `${amount} coins purchased.` };
}


function sellCoins(guildId, userId, amount, pricePerCoin) {
    const eco = loadEconomy();
    const guild = getGuildData(eco, guildId);
    const user = getUserEc(eco, guildId, userId);

    if (user.coins < amount) {
        return { success: false, message: 'Not enough coins.' };
    }

    const revenue = amount * pricePerCoin;
    user.coins -= amount;
    user.balance += revenue;  // 所持金を増加
    guild.totalCoins -= amount;  // コイン総量を減少

    saveEconomy(eco);
    return { success: true, message: `${amount} coins sold for ${revenue} balance.` };
}


function tradeBetweenGuilds(fromGuildId, toGuildId, amount) {
    const eco = loadEconomy();
    const fromGuild = getGuildData(eco, fromGuildId);
    const toGuild = getGuildData(eco, toGuildId);

    // 供給量がゼロでないことを確認
    if (fromGuild.totalCoins <= 0 || toGuild.totalCoins <= 0) {
        return { success: false, message: 'Invalid trade: one of the coins has no supply.' };
    }

    // コインの移動
    const ratio = toGuild.totalCoins / fromGuild.totalCoins; // 交換比率
    const receivedAmount = amount * ratio;

    // 送金後のコイン総量を更新
    fromGuild.totalCoins -= amount;   // aサーバーから送る
    toGuild.totalCoins += receivedAmount;  // bサーバーへ送る

    saveEconomy(eco);

    return {
        success: true,
        fromAmount: amount,
        toAmount: receivedAmount.toFixed(2),
        message: `${amount} ${getCoinName(fromGuildId)} → ${receivedAmount.toFixed(2)} ${getCoinName(toGuildId)}`
    };
}


function exchangeCoins(fromGuildId, toGuildId, userId, amount) {
    const eco = loadEconomy();
    const fromGuild = getGuildData(eco, fromGuildId);
    const toGuild = getGuildData(eco, toGuildId);
    const user = getUserEc(eco, fromGuildId, userId);

    // ユーザーの残高チェック
    if (user.balance < amount) {
        return {
            success: false,
            message: `❌ 残高が足りません。${amount} ${getCoinName(fromGuildId)}を交換するには${amount}の残高が必要です。`
        };
    }

    // 各サーバーの残高合計（=通貨の価値の基準）を取得
    const fromValue = fromGuild.totalBalance || 1;  // 0除算を防止
    const toValue = toGuild.totalBalance || 1;

    const ratio = toValue / fromValue;
    const receivedAmount = amount * ratio;

    // 自サーバーの残高を減らす
    user.balance -= amount;
    fromGuild.totalBalance = (fromGuild.totalBalance || 0) - amount;

    // foreignBalance（他サーバーでの残高）を加算
    if (!user.foreignBalance) {
        user.foreignBalance = {};
    }
    user.foreignBalance[toGuildId] = (user.foreignBalance[toGuildId] || 0) + receivedAmount;

    // 相手サーバーの総残高からも差し引く（あくまで交換なので値を減らす）
    toGuild.totalBalance = (toGuild.totalBalance || 0) - receivedAmount;

    saveEconomy(eco);
    return {
        success: true,
        message: `🔄 交換完了！\n• 支払: ${amount} ${getCoinName(fromGuildId)}\n• 受取: ${receivedAmount.toFixed(2)} ${getCoinName(toGuildId)}（レート: ${ratio.toFixed(3)}）`
    };
}





function updateGuildTotalBalanceAsCoins() {
    const eco = loadEconomy();

    for (const guildId in eco.guilds) {
        const guild = eco.guilds[guildId];
        let totalBalance = 0;

        for (const userId in guild.users) {
            const user = guild.users[userId];
            const balance = Number(user.balance);
            if (!isNaN(balance) && balance >= 0) {
                totalBalance += balance;
            }
        }

        guild.totalBalance = totalBalance;
    }

    saveEconomy(eco);
    console.log(`[${new Date().toLocaleTimeString()}] Guildごとの残高合計を totalBalance に記録しました。`);
}
setInterval(updateGuildTotalBalanceAsCoins, 60 * 1000);


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
};
