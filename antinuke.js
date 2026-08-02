const { AuditLogEvent } = require("discord.js");
const fs = require("fs");
const config = JSON.parse(fs.readFileSync("./config.json", "utf8"));

const LIMIT = config.antinuke.limit;
const TIME = config.antinuke.time;
const LOG_CHANNEL = config.antinuke.logChannelId;

const logData = {
    channelDelete: {},
    ban: {},
    kick: {}
};

function record(type, userId) {
    const now = Date.now();
    logData[type][userId] ??= [];
    logData[type][userId].push(now);
    logData[type][userId] =
        logData[type][userId].filter(t => now - t <= TIME);
    return logData[type][userId].length;
}

async function sendLog(guild, embed) {
    try {
        const ch = guild.channels.cache.get(LOG_CHANNEL);
        if (ch) await ch.send({ embeds: [embed] });
    } catch (e) {
        console.error("ログ送信失敗", e);
    }
}

function reset(type, userId) {
    delete logData[type][userId];
}


async function punish(guild, executor, reason, count) {
    console.log(
        `[AntiNuke] ${executor.tag} (${executor.id}) | ${reason} | ${count}回`
    );

    const embed = {
        title: "AntiNuke",
        color: 0xff0000,
        fields: [
            { name: "ユーザー", value: `${executor.tag}\n${executor.id}` },
            { name: "理由", value: reason },
            { name: "回数", value: `${count}` }
        ],
        timestamp: new Date()
    };

    await sendLog(guild, embed);

    try {
        const member = await guild.members.fetch(executor.id);
        if (member.bannable) {
            await member.ban({ reason: `AntiNuke: ${reason}` });
        }
    } catch (e) {
        console.error("BAN失敗:", e);
    }
}


async function antinuke(client) {


    client.on("channelDelete", async (channel) => {
        try {
            const logs = await channel.guild.fetchAuditLogs({
                type: AuditLogEvent.ChannelDelete,
                limit: 1
            });

            const entry = logs.entries.first();
            if (!entry) return;

            const executor = entry.executor;
            if (!executor || executor.id === client.user.id) return;

            const count = record("channelDelete", executor.id);

            console.log(
                `チャンネル大量削除を検知 ${executor.tag} (${count}/${LIMIT})`
            );

            if (count >= LIMIT) {
                await punish(channel.guild, executor, "チャンネル大量削除", count);
            }
        } catch (e) {
            console.error("チャンネル大量削除検知中にエラー:", e);
        }
    });


 
    client.on("guildBanAdd", async (ban) => {

        console.log("BANイベント発火", ban.user.id);
        try {
            const logs = await ban.guild.fetchAuditLogs({
                type: AuditLogEvent.MemberBanAdd, 
                limit: 5
            });

            const entry = logs.entries.find(e =>
                e.target?.id === ban.user.id &&
                Date.now() - e.createdTimestamp < 5000
            );

            if (!entry) return; 

            const executor = entry.executor;
            if (!executor) return;
            if (executor.id === client.user.id) return;

            const count = record("ban", executor.id);

            console.log(
                `大量BANを検知 ${executor.tag} (${count}/${LIMIT})`
            );

            if (count >= LIMIT) {
                await punish(ban.guild, executor, "大量BAN", count);
                reset("ban", executor.id);
                return;
            }

        } catch (err) {
            console.error("ban検知中にエラー:", err);
        }
    });

    client.on("guildMemberRemove", async (member) => {
        try {
            const logs = await member.guild.fetchAuditLogs({
                type: AuditLogEvent.guildMemberRemove,
                limit: 5
            });

            const entry = logs.entries.find(e =>
                e.target?.id === member.id &&
                Date.now() - e.createdTimestamp < 5000
            );

            if (!entry) return;

            const executor = entry.executor;
            if (!executor || executor.id === client.user.id) return;

            const count = record("kick", executor.id);

            console.log(
                `大量キックを検知: ${executor.tag} (${count}/${LIMIT})`
            );

            if (count >= LIMIT) {
                await punish(member.guild, executor, "大量キック", count);
                reset("kick", executor.id);
            }

        } catch (e) {
            console.error("大量キック検知中にエラー:", e);
        }
    });



}

module.exports = { antinuke };
