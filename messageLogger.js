// systems/messageloger.js

const fs = require("fs");
const path = require("path");
const io = require("./systems/io");
const { EmbedBuilder } = require("discord.js");

const log = require("./data/serverlog.json");
const { Ranking } = require("./systems/ranking");

const BASE_PATH = path.join(
    __dirname,
    "data/messagecount"
);


// ============================================================
// ディレクトリ
// ============================================================

if (!fs.existsSync(BASE_PATH)) {
    fs.mkdirSync(BASE_PATH, {
        recursive: true
    });
}


// ============================================================
// ファイル関連
// ============================================================

function getGuildPath(guildId) {
    return path.join(
        BASE_PATH,
        `${guildId}.json`
    );
}


function loadGuildData(guildId) {
    const filePath = getGuildPath(guildId);

    if (!fs.existsSync(filePath)) {
        const initialData = {
            roles: {},
            logs: {}
        };

        io.writeJsonSync(filePath, initialData);

        return initialData;
    }

    const raw = fs.readFileSync(
        filePath,
        "utf8"
    );

    if (!raw.trim()) {
        return {
            roles: {},
            logs: {}
        };
    }

    const data = JSON.parse(raw);

    // 古いデータなどで存在しない場合に備える
    data.roles ??= {};
    data.logs ??= {};

    return data;
}


function saveGuildData(guildId, data) {
    const filePath = getGuildPath(guildId);

    io.writeJsonSync(filePath, data);
}


// ============================================================
// 1分バッファ
// ============================================================

const minuteBuffer = {};


// ============================================================
// ログ
// ============================================================

function logMessage(...args) {
    const text = args
        .map(a =>
            typeof a === "object"
                ? JSON.stringify(a, null, 2)
                : a
        )
        .join(" ");

    console.log(text);

    const logPath = path.join(
        __dirname,
        "log.txt"
    );

    io.appendFileSync(
        logPath,
        `[${new Date().toISOString()}] ${text}\n`,
        "utf8"
    );
}


function logError(...args) {
    const text = args
        .map(a =>
            typeof a === "object"
                ? JSON.stringify(a, null, 2)
                : a
        )
        .join(" ");

    console.error(text);

    const logPath = path.join(
        __dirname,
        "log.txt"
    );

    io.appendFileSync(
        logPath,
        `[${new Date().toISOString()}] ERROR: ${text}\n`,
        "utf8"
    );
}


// ============================================================
// ロール操作
// ============================================================

async function updateSingleRole(
    guild,
    role,
    userId
) {
    if (!role) return false;

    let changed = false;

    // 現在付いている人から削除
    for (const member of role.members.values()) {
        if (member.id !== userId) {
            await member.roles
                .remove(role)
                .catch(err =>
                    logError(
                        "ロール削除失敗:",
                        member.user.tag,
                        err.message
                    )
                );

            changed = true;
        }
    }

    // 対象者に付与
    if (userId) {
        const member =
            await guild.members
                .fetch(userId)
                .catch(() => null);

        if (
            member &&
            !member.roles.cache.has(role.id)
        ) {
            await member.roles
                .add(role)
                .catch(err =>
                    logError(
                        "ロール付与失敗:",
                        member.user.tag,
                        err.message
                    )
                );

            changed = true;
        }
    }

    return changed;
}


async function updateTop3Role(
    guild,
    role,
    userIds
) {
    if (!role) return false;

    let changed = false;

    // 対象外を削除
    for (const member of role.members.values()) {
        if (!userIds.includes(member.id)) {
            await member.roles
                .remove(role)
                .catch(err =>
                    logError(
                        "TOP3ロール削除失敗:",
                        member.user.tag,
                        err.message
                    )
                );

            changed = true;
        }
    }

    // TOP3に付与
    for (const userId of userIds) {
        const member =
            await guild.members
                .fetch(userId)
                .catch(() => null);

        if (
            member &&
            !member.roles.cache.has(role.id)
        ) {
            await member.roles
                .add(role)
                .catch(err =>
                    logError(
                        "TOP3ロール付与失敗:",
                        member.user.tag,
                        err.message
                    )
                );

            changed = true;
        }
    }

    return changed;
}


async function updateActiveRole(
    guild,
    role,
    ranking
) {
    if (!role) return false;

    let changed = false;

    const userIds = ranking.map(
        user => user.userId
    );

    // TOP10から外れた人を削除
    for (const member of role.members.values()) {
        if (!userIds.includes(member.id)) {
            await member.roles
                .remove(role)
                .catch(err =>
                    logError(
                        "アクティブロール削除失敗:",
                        member.user.tag,
                        err.message
                    )
                );

            changed = true;
        }
    }

    // TOP10に付与
    for (const userId of userIds) {
        const member =
            await guild.members
                .fetch(userId)
                .catch(() => null);

        if (
            member &&
            !member.roles.cache.has(role.id)
        ) {
            await member.roles
                .add(role)
                .catch(err =>
                    logError(
                        "アクティブロール付与失敗:",
                        member.user.tag,
                        err.message
                    )
                );

            changed = true;
        }
    }

    return changed;
}


async function updateNewRole(
    guild,
    role,
    longTotals
) {
    if (!role) return;

    const userIds =
        Object.keys(longTotals);

    // 72時間以内に喋っていない人を削除
    for (const member of role.members.values()) {
        if (!userIds.includes(member.id)) {
            await member.roles
                .remove(role)
                .catch(err =>
                    logError(
                        "NEWROLE削除失敗:",
                        member.user.tag,
                        err.message
                    )
                );
        }
    }

    // 72時間以内に喋った人に付与
    for (const userId of userIds) {
        const member =
            await guild.members
                .fetch(userId)
                .catch(() => null);

        if (
            member &&
            !member.roles.cache.has(role.id)
        ) {
            await member.roles
                .add(role)
                .catch(err =>
                    logError(
                        "NEWROLE付与失敗:",
                        member.user.tag,
                        err.message
                    )
                );
        }
    }
}


// ============================================================
// アクティブメンバーEmbed
// ============================================================

async function sendActiveEmbed({
    guild,
    ranking,
    shortTopUser,
    longTopUser,
    topUserId,
    longTop3Ids
}) {
    const LOG_CHANNEL_ID =
        log[guild.id]?.messagelog;

    if (!LOG_CHANNEL_ID) return;

    const embed = new EmbedBuilder()
        .setTitle("アクティブメンバーリスト")
        .setColor(0x00FF00)
        .setTimestamp();

    for (const user of ranking) {
        const member =
            await guild.members
                .fetch(user.userId)
                .catch(() => null);

        if (!member) continue;

        const roles = [];

        if (topUserId === user.userId) {
            roles.push("雑談王");
        }
        else if (longTopUser === user.userId) {
            roles.push("長期一位");
        }
        else if (shortTopUser === user.userId) {
            roles.push("短期一位");
        }
        else if (longTop3Ids.includes(user.userId)) {
            roles.push("アクティブtop3");
        }

        const roleText =
            roles.length
                ? `, ${roles.join(", ")}`
                : "";

        embed.addFields({
            name: `${user.rank}位`,
            value:
                `${member.user.tag} ` +
                `(${user.type}${roleText}) ` +
                `S${user.short}, L${user.long}`,
            inline: false
        });
    }

    const channel =
        await guild.channels
            .fetch(LOG_CHANNEL_ID)
            .catch(() => null);

    if (channel?.isTextBased()) {
        await channel.send({
            embeds: [embed]
        }).catch(err =>
            logError(
                "Embed送信失敗:",
                err.message
            )
        );

        logMessage(
            "アクティブメンバーEmbed送信完了"
        );
    }
}

async function updateGuildRoles(client, guildId) {
    const guildData = loadGuildData(guildId);
    const ranking = Ranking(guildData.logs, Date.now(), 10);
    const guild = await client.guilds.fetch(guildId);
    const roles = guildData.roles || {};

    const topRole = guild.roles.cache.get(roles.TOP_ROLE_ID);
    const top3Role = guild.roles.cache.get(roles.TOP3_ROLE_ID);
    const activeRole = guild.roles.cache.get(roles.ACTIVE_ROLE_ID);
    const activeLongTop = guild.roles.cache.get(roles.ACTIVE_LONG_TOP_ID);
    const activeShortTop = guild.roles.cache.get(roles.ACTIVE_SHORT_TOP_ID);
    const newrole = guild.roles.cache.get(roles.NEWROLE_ID);

    let roleChanged = false;
    roleChanged = await updateSingleRole(guild, topRole, ranking.topUserId) || roleChanged;
    roleChanged = await updateTop3Role(guild, top3Role, ranking.longTop3Ids) || roleChanged;
    roleChanged = await updateActiveRole(guild, activeRole, ranking.activeRanking) || roleChanged;
    roleChanged = await updateSingleRole(guild, activeLongTop, ranking.longTopUser) || roleChanged;
    roleChanged = await updateSingleRole(guild, activeShortTop, ranking.shortTopUser) || roleChanged;
    await updateNewRole(guild, newrole, ranking.longTotals);

    logMessage("ロール更新完了:", guildId);
    if (roleChanged) {
        await sendActiveEmbed({
            guild,
            ranking: ranking.activeRanking,
            shortTopUser: ranking.shortTopUser,
            longTopUser: ranking.longTopUser,
            topUserId: ranking.topUserId,
            longTop3Ids: ranking.longTop3Ids
        });
    }
}

let hourlyRoleUpdateTimer = null;

function startHourlyRoleUpdates(client) {
    if (hourlyRoleUpdateTimer) return;

    const scheduleNextUpdate = () => {
        const now = new Date();
        const nextHour = new Date(now);
        nextHour.setHours(now.getHours() + 1, 0, 0, 0);

        hourlyRoleUpdateTimer = setTimeout(async () => {
            hourlyRoleUpdateTimer = null;
            try {
                for (const guildId of client.guilds.cache.keys()) {
                    try {
                        await updateGuildRoles(client, guildId);
                    } catch (error) {
                        logError("ロール更新失敗:", guildId, error);
                    }
                }
            } finally {
                scheduleNextUpdate();
            }
        }, nextHour.getTime() - now.getTime());
    };

    scheduleNextUpdate();
}


// ============================================================
// flushMinuteData
// ============================================================

async function flushMinuteData(client) {
    logMessage(
        "===== message flush開始 ====="
    );

    const pendingEntries = Object.entries(minuteBuffer);
    for (const [guildId] of pendingEntries) {
        delete minuteBuffer[guildId];
    }

    const minuteKey =
        new Date()
            .toISOString()
            .slice(0, 16);

    logMessage(
        "minuteKey:",
        minuteKey
    );

    for (const [guildId, pendingData] of pendingEntries) {
        let dataSaved = false;
        try {
            // ------------------------------------------------
            // データ保存
            // ------------------------------------------------

            const guildData =
                loadGuildData(guildId);

            const minuteData = guildData.logs[minuteKey] || {
                total: 0,
                users: {}
            };
            minuteData.total += pendingData.total || 0;

            for (const [userId, count] of Object.entries(pendingData.users || {})) {
                minuteData.users[userId] = (minuteData.users[userId] || 0) + count;
            }

            guildData.logs[minuteKey] = minuteData;

            saveGuildData(
                guildId,
                guildData
            );
            dataSaved = true;


        } catch (err) {
            if (!dataSaved) {
                const retryData = minuteBuffer[guildId] ??= {
                    total: 0,
                    users: {}
                };
                retryData.total += pendingData.total || 0;
                retryData.users ??= {};

                for (const [userId, count] of Object.entries(pendingData.users || {})) {
                    retryData.users[userId] = (retryData.users[userId] || 0) + count;
                }
            }

            logError(
                "メッセージ集計処理失敗:",
                guildId,
                err
            );
        }
    }


    logMessage(
        "===== message flush終了 =====\n"
    );
}


// ============================================================
// exports
// ============================================================

module.exports = {
    flushMinuteData,
    startHourlyRoleUpdates,
    minuteBuffer,
    loadGuildData,
    saveGuildData
};