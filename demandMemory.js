const fs = require('fs');
const io = require('./systems/io');
const path = require('path');
const DEMAND_FILE = path.join(__dirname, './data/demand.json');

function loadDemand() {
    try {
        if (!fs.existsSync(DEMAND_FILE)) return {};
        return JSON.parse(fs.readFileSync(DEMAND_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function saveDemand(data) {
    io.writeJsonSync(DEMAND_FILE, data);
}

function addDemand(guildId, percentChange) {
    const data = loadDemand();

    if (!(guildId in data)) {
        data[guildId] = 0;
    }

    data[guildId] += percentChange;

    // 🔥 暴走防止（超重要）
    data[guildId] = Math.max(-0.99, Math.min(9, data[guildId]));

    saveDemand(data);
}

function demandtime() {
  
}


function getDemandIndex(guildId) {
    const data = loadDemand();
    return data[guildId] || 0;
}

function getAllDemands() {
    const raw = loadDemand();

    if (!raw) return {}; // nullやundefinedなら空オブジェクト
    if (Array.isArray(raw)) {
        // 配列形式 [{guildId: demand}, ...] の場合
        const all = {};
        for (const obj of raw) {
            Object.assign(all, obj);
        }
        return all;
    } else if (typeof raw === 'object') {
        // オブジェクト形式 {guildId: demand, ...} の場合
        return raw;
    } else {
        return {}; // その他は空
    }
}



module.exports = { addDemand, getDemandIndex, getAllDemands, demandtime };
