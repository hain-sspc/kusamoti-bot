const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const log = require("./data/serverlog.json");

const BASE_PATH = path.join(__dirname, 'data/messagecount');

// ===== ディレクトリ作成 =====
if (!fs.existsSync(BASE_PATH)) {
    fs.mkdirSync(BASE_PATH, { recursive: true });
}

// ===== パス取得 =====
function getGuildPath(guildId) {
    return path.join(BASE_PATH, `${guildId}.json`);
}

// ===== 読み込み =====
function loadGuildData(guildId) {
    const filePath = getGuildPath(guildId);

    if (!fs.existsSync(filePath)) {
        const initialData = {
            roles: {},
            logs: {}
        };
        fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
        return initialData;
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return { roles: {}, logs: {} };

    return JSON.parse(raw);
}





// ===== 保存 =====
function saveGuildData(guildId, data) {
    const filePath = getGuildPath(guildId);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ===== 1分バッファ =====
const minuteBuffer = {};

// ===== ログ出力関数 =====
function logMessage(...args) {
    const text = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : a)).join(' ');
    console.log(text); // コンソール出力
    const logPath = path.join(__dirname, 'log.txt');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${text}\n`, 'utf8');
}

function logError(...args) {
    const text = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : a)).join(' ');
    console.error(text); // コンソール出力
    const logPath = path.join(__dirname, 'log.txt');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ERROR: ${text}\n`, 'utf8');
}

// ===== flushMinuteData 関数 =====
async function flushMinuteData(client) {
    logMessage("===== message flush開始 =====");
    const now = Date.now();
    const minuteKey = new Date().toISOString().slice(0, 16);
    logMessage(minuteKey, new Date(minuteKey).toString());
    

    for (const guildId of Object.keys(minuteBuffer)) {
        const guildData = loadGuildData(guildId);
        guildData.logs[minuteKey] = minuteBuffer[guildId];

        logMessage("logs keys:", Object.keys(guildData.logs).slice(0, 5));
        logMessage("logs count:", Object.keys(guildData.logs).length);

        // ===== 過去24h/72h集計 =====
        const shortTotals = {};
        const longTotals = {};

        for (const [timeKey, record] of Object.entries(guildData.logs)) {
            const time = new Date(timeKey.slice(0, 16) + ':00Z').getTime();
            const age = now - time;
            for (const [userId, count] of Object.entries(record.users || {})) {
                if (age <= 24 * 60 * 60 * 1000) shortTotals[userId] = (shortTotals[userId] || 0) + count;
                if (age <= 72 * 60 * 60 * 1000) longTotals[userId] = (longTotals[userId] || 0) + count;
            }
        }

        saveGuildData(guildId, guildData);

        try {
            const guild = await client.guilds.fetch(guildId);
            const roles = guildData.roles || {};

            const topRole = guild.roles.cache.get(roles.TOP_ROLE_ID);
            const top3Role = guild.roles.cache.get(roles.TOP3_ROLE_ID);
            const activeRole = guild.roles.cache.get(roles.ACTIVE_ROLE_ID);
            const activeLongTop = guild.roles.cache.get(roles.ACTIVE_LONG_TOP_ID);
            const activeShortTop = guild.roles.cache.get(roles.ACTIVE_SHORT_TOP_ID);
            const newrole = guild.roles.cache.get(roles.NEWROLE_ID);




            logMessage("==== NEWROLE CHECK ====");
            logMessage("NEWROLE_ID:", roles.NEWROLE_ID);
            logMessage("newrole exists:", !!newrole);
            logMessage("newrole name:", newrole?.name);

            const longRanking = Object.entries(longTotals).sort((a, b) => b[1] - a[1]);
            const shortRanking = Object.entries(shortTotals).sort((a, b) => b[1] - a[1]);

            const longTopUser = longRanking[0]?.[0];
            const shortTopUser = shortRanking[0]?.[0];
            const topUserId = (longTopUser && shortTopUser && longTopUser === shortTopUser) ? longTopUser : null;

            let roleChanged = false;


            // ===== 雑談王 =====
            if (topRole) {
                for (const member of topRole.members.values()) {
                    if (member.id !== topUserId) {
                        await member.roles.remove(topRole).catch(err => logError("雑談王ロール削除失敗:", member.user.tag, err.message));
                        roleChanged = true;
                    }
                }
                if (topUserId) {
                    const m = await guild.members.fetch(topUserId).catch(() => null);
                    if (m && !m.roles.cache.has(topRole.id)) {
                        await m.roles.add(topRole).catch(err => logError("雑談王付与失敗:", m.user.tag, err.message));
                        logMessage("雑談王付与:", m.user.tag);
                        roleChanged = true;
                    }
                }
            }

            // ===== トップ3 =====
            if (top3Role) {
                const longTop3Ids = longRanking.slice(0, 3).map(r => r[0]);

                for (const member of top3Role.members.values()) {
                    if (!longTop3Ids.includes(member.id)) {
                        await member.roles.remove(top3Role).catch(err => logError("トップ3ロール削除失敗:", member.user.tag, err.message));
                        roleChanged = true;
                    }
                }

                for (const userId of longTop3Ids) {
                    const m = await guild.members.fetch(userId).catch(() => null);
                    if (m && !m.roles.cache.has(top3Role.id)) {
                        await m.roles.add(top3Role).catch(err => logError("トップ3付与失敗:", m.user.tag, err.message));
                        logMessage("トップ3付与:", m.user.tag);
                        roleChanged = true;
                    }
                }
            }

            // ===== アクティブ候補（割合ベース） =====
            if (activeRole) {
                const activeCandidates = {};
                const allUserIds = new Set([...Object.keys(shortTotals), ...Object.keys(longTotals)]);
                const totalShortCount = Object.values(shortTotals).reduce((a, b) => a + b, 0);
                const totalLongCount = Object.values(longTotals).reduce((a, b) => a + b, 0);

                for (const userId of allUserIds) {
                    activeCandidates[userId] = {
                        shortRatio: totalShortCount ? (shortTotals[userId] || 0) / totalShortCount : 0,
                        longRatio: totalLongCount ? (longTotals[userId] || 0) / totalLongCount : 0
                    };
                }

                const rankedCandidates = Object.entries(activeCandidates)
                    .sort((a, b) => {
                        const maxA = Math.max(a[1].shortRatio, a[1].longRatio);
                        const maxB = Math.max(b[1].shortRatio, b[1].longRatio);
                        if (maxB !== maxA) return maxB - maxA;
                        const totalA = (shortTotals[a[0]] || 0) + (longTotals[a[0]] || 0);
                        const totalB = (shortTotals[b[0]] || 0) + (longTotals[b[0]] || 0);
                        return totalB - totalA;
                    })
                    .slice(0, 10);

                for (const member of activeRole.members.values()) {
                    if (!rankedCandidates.some(r => r[0] === member.id)) {
                        await member.roles.remove(activeRole).catch(err => logError("アクティブロール削除失敗:", member.user.tag, err.message));
                        roleChanged = true;
                    }
                }

                for (const [userId] of rankedCandidates) {
                    const member = await guild.members.fetch(userId).catch(() => null);
                    if (member && !member.roles.cache.has(activeRole.id)) {
                        await member.roles.add(activeRole).catch(err => logError("アクティブロール付与失敗:", member.user.tag, err.message));
                        logMessage("アクティブロール付与:", member.user.tag);
                        roleChanged = true;
                    }
                }
            }

            // ===== アクティブ一位 =====
            if (activeLongTop && longTopUser) {
                for (const member of activeLongTop.members.values()) {
                    if (member.id !== longTopUser) {
                        await member.roles.remove(activeLongTop).catch(err => logError("長期一位削除失敗:", member.user.tag, err.message));
                        roleChanged = true;
                    }
                }
                const m = await guild.members.fetch(longTopUser).catch(() => null);
                if (m && !m.roles.cache.has(activeLongTop.id)) {
                    await m.roles.add(activeLongTop).catch(err => logError("長期一位付与失敗:", m.user.tag, err.message));
                    logMessage("長期一位付与:", m.user.tag);
                    roleChanged = true;
                }
            }

            if (activeShortTop && shortTopUser) {
                for (const member of activeShortTop.members.values()) {
                    if (member.id !== shortTopUser) {
                        await member.roles.remove(activeShortTop).catch(err => logError("短期一位削除失敗:", member.user.tag, err.message));
                        roleChanged = true;
                    }
                }
                const m = await guild.members.fetch(shortTopUser).catch(() => null);
                if (m && !m.roles.cache.has(activeShortTop.id)) {
                    await m.roles.add(activeShortTop).catch(err => logError("短期一位付与失敗:", m.user.tag, err.message));
                    logMessage("短期一位付与:", m.user.tag);
                    roleChanged = true;
                }
            }

            logMessage("==== LONG TOTALS CHECK ====");
            logMessage("longTotals:", longTotals);
            logMessage("longTotals user count:", Object.keys(longTotals).length);

            // ===== NEWROLE（3日以内に喋った人） =====
            if (newrole) {
                const newroleIds = Object.keys(longTotals);

                for (const member of newrole.members.values()) {
                    if (!newroleIds.includes(member.id)) {
                        await member.roles.remove(newrole).catch(err => logError("NEWROLE削除失敗:", member.user.tag, err.message));
                    }
                }

                for (const userId of newroleIds) {
                    const m = await guild.members.fetch({ user: userId, force: true }).catch(err => {
                        logError("fetch失敗:", userId, err.message);
                        return null;
                    });
                    if (m && !m.roles.cache.has(newrole.id)) {
                        await m.roles.add(newrole).catch(err => logError("NEWROLE付与失敗:", m.user.tag, err.message));
                        logMessage("NEWROLE付与試行:", m.user.tag);
                    }
                }
            }

            // ===== アクティブメンバーEmbed送信 =====
            if (roleChanged === true) {
              

                const LOG_CHANNEL_ID = log[guild.id]?.messagelog;
                if (!LOG_CHANNEL_ID) continue;
                const totalShortCount = Object.values(shortTotals).reduce((a, b) => a + b, 0);
                const totalLongCount = Object.values(longTotals).reduce((a, b) => a + b, 0);

          

                const activeCandidates = {};
                const allUserIds = new Set([...Object.keys(shortTotals), ...Object.keys(longTotals)]);
                for (const userId of allUserIds) {
                    const shortRatio = totalShortCount ? (shortTotals[userId] || 0) / totalShortCount : 0;
                    const longRatio = totalLongCount ? (longTotals[userId] || 0) / totalLongCount : 0;
                    activeCandidates[userId] = { shortRatio, longRatio };
                }

                const rankedCandidates = Object.entries(activeCandidates)
                    .sort((a, b) => {
                        const maxA = Math.max(a[1].shortRatio, a[1].longRatio);
                        const maxB = Math.max(b[1].shortRatio, b[1].longRatio);
                        if (maxB !== maxA) return maxB - maxA;
                        const totalA = (shortTotals[a[0]] || 0) + (longTotals[a[0]] || 0);
                        const totalB = (shortTotals[b[0]] || 0) + (longTotals[b[0]] || 0);
                        return totalB - totalA;
                    })
                    .slice(0, 10);

                const embed = new EmbedBuilder()
                    .setTitle('アクティブメンバーリスト')
                    .setColor(0x00FF00)
                    .setTimestamp();

                const longTop3Ids = longRanking.slice(0, 3).map(r => r[0]);

                for (let i = 0; i < rankedCandidates.length; i++) {
                    const [userId, info] = rankedCandidates[i];
                    const member = await guild.members.fetch(userId).catch(() => null);
                    if (!member) continue;

                    const typeLabel = info.shortRatio >= info.longRatio ? '短期' : '長期';
                    const roles = [];
                    if (topUserId === userId) roles.push('雑談王');
                    else if (longTopUser === userId) roles.push('長期一位');
                    else if (shortTopUser === userId) roles.push('短期一位');
                    else if (longTop3Ids.includes(userId)) roles.push('アクティブtop3');

                    const isShort = info.shortRatio >= info.longRatio;

                    const messageCount = isShort
                        ? (shortTotals[userId] || 0)
                        : (longTotals[userId] || 0);
                    const messageCountShort = shortTotals[userId] || 0;
                    const messageCountLong = longTotals[userId] || 0;

                    const messageDisplay = `S${messageCountShort}, L${messageCountLong}`;
                    

                    embed.addFields({
                        name: `${i + 1}位`,
                        value: `${member.user.tag} (${typeLabel}${roles.length ? ', ' + roles.join(', ') : ''}) ${messageDisplay}`,
                        inline: false
                    });
                }

                const logChannel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
                if (logChannel?.isTextBased()) {
                    await logChannel.send({ embeds: [embed] }).catch(err => logError("Embed送信失敗:", err.message));
                    logMessage("アクティブメンバーEmbed送信完了");
                }
            }

        } catch (err) {
            console.log("ランキング処理失敗:", err);
        }
    }

    for (const key in minuteBuffer) delete minuteBuffer[key];
    logMessage("===== message flush終了 =====\n");
}



module.exports = {
    flushMinuteData,
    minuteBuffer,
    loadGuildData,
    saveGuildData
}