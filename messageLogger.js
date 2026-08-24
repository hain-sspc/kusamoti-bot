// systems/messageloger.js

const fs = require("fs");
const path = require("path");
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

        fs.writeFileSync(
            filePath,
            JSON.stringify(initialData, null, 2)
        );

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

    fs.writeFileSync(
        filePath,
        JSON.stringify(data, null, 2)
    );
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

    fs.appendFileSync(
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

    fs.appendFileSync(
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


// ============================================================
// flushMinuteData
// ============================================================

async function flushMinuteData(client) {
    logMessage(
        "===== message flush開始 ====="
    );

    const now = Date.now();

    const minuteKey =
        new Date()
            .toISOString()
            .slice(0, 16);

    logMessage(
        "minuteKey:",
        minuteKey
    );

    for (const guildId of Object.keys(minuteBuffer)) {
        try {
            // ------------------------------------------------
            // データ保存
            // ------------------------------------------------

            const guildData =
                loadGuildData(guildId);

            guildData.logs[minuteKey] =
                minuteBuffer[guildId];

            saveGuildData(
                guildId,
                guildData
            );


            // ------------------------------------------------
            // ランキング計算
            // ------------------------------------------------

            const {
                shortTotals,
                longTotals,
                shortRanking,
                longRanking,
                activeRanking,
                shortTopUser,
                longTopUser,
                topUserId,
                longTop3Ids
            } = Ranking(
                guildData.logs,
                now,
                10
            );


            logMessage(
                "ランキング計算:",
                guildId
            );

            logMessage(
                "長期ユーザー数:",
                Object.keys(longTotals).length
            );


            // ------------------------------------------------
            // Guild取得
            // ------------------------------------------------

            const guild =
                await client.guilds
                    .fetch(guildId);

            const roles =
                guildData.roles || {};


            const topRole =
                guild.roles.cache.get(
                    roles.TOP_ROLE_ID
                );

            const top3Role =
                guild.roles.cache.get(
                    roles.TOP3_ROLE_ID
                );

            const activeRole =
                guild.roles.cache.get(
                    roles.ACTIVE_ROLE_ID
                );

            const activeLongTop =
                guild.roles.cache.get(
                    roles.ACTIVE_LONG_TOP_ID
                );

            const activeShortTop =
                guild.roles.cache.get(
                    roles.ACTIVE_SHORT_TOP_ID
                );

            const newrole =
                guild.roles.cache.get(
                    roles.NEWROLE_ID
                );


            // ------------------------------------------------
            // ロール更新
            // ------------------------------------------------

            let roleChanged = false;

            roleChanged |=
                await updateSingleRole(
                    guild,
                    topRole,
                    topUserId
                );

            roleChanged |=
                await updateTop3Role(
                    guild,
                    top3Role,
                    longTop3Ids
                );

            roleChanged |=
                await updateActiveRole(
                    guild,
                    activeRole,
                    activeRanking
                );

            roleChanged |=
                await updateSingleRole(
                    guild,
                    activeLongTop,
                    longTopUser
                );

            roleChanged |=
                await updateSingleRole(
                    guild,
                    activeShortTop,
                    shortTopUser
                );

            await updateNewRole(
                guild,
                newrole,
                longTotals
            );


            // ------------------------------------------------
            // Embed
            // ------------------------------------------------

            if (roleChanged) {
                await sendActiveEmbed({
                    guild,
                    ranking: activeRanking,
                    shortTopUser,
                    longTopUser,
                    topUserId,
                    longTop3Ids
                });
            }

        } catch (err) {
            logError(
                "ランキング処理失敗:",
                guildId,
                err
            );
        }
    }


    // ------------------------------------------------
    // バッファ削除
    // ------------------------------------------------

    for (const key in minuteBuffer) {
        delete minuteBuffer[key];
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
    minuteBuffer,
    loadGuildData,
    saveGuildData
};