const { loadGuildData } = require("../messageLogger");
const { EmbedBuilder } = require("discord.js");
const serverLogs = require("../data/serverlog.json");

const GRADE_ROLE_KEYS = [
    "RANK1_ID",
    "RANK2_ID",
    "RANK3_ID",
    "RANK4_ID",
    "RANK5_ID"
];
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function calculateMonthlyGrades(logs, now = new Date()) {
    const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
    const previousMonth = new Date(Date.UTC(
        jstNow.getUTCFullYear(),
        jstNow.getUTCMonth() - 1,
        1
    ));
    const previousMonthLastDay = new Date(Date.UTC(
        jstNow.getUTCFullYear(),
        jstNow.getUTCMonth(),
        0
    )).getUTCDate();
    const monthAgoJst = Date.UTC(
        previousMonth.getUTCFullYear(),
        previousMonth.getUTCMonth(),
        Math.min(jstNow.getUTCDate(), previousMonthLastDay),
        jstNow.getUTCHours(),
        jstNow.getUTCMinutes(),
        jstNow.getUTCSeconds(),
        jstNow.getUTCMilliseconds()
    );
    const periodStart = Math.floor(
        (monthAgoJst - JST_OFFSET_MS) / (60 * 1000)
    ) * (60 * 1000);
    const periodEnd = now.getTime();
    const monthlyTotals = {};

    for (const [timeKey, record] of Object.entries(logs || {})) {
        const logTime = new Date(
            `${String(timeKey).slice(0, 16)}:00Z`
        ).getTime();

        if (
            !Number.isFinite(logTime) ||
            logTime < periodStart ||
            logTime > periodEnd
        ) {
            continue;
        }

        for (const [userId, rawCount] of Object.entries(record?.users || {})) {
            const count = Number(rawCount);
            if (!Number.isFinite(count) || count <= 0) continue;
            monthlyTotals[userId] = (monthlyTotals[userId] || 0) + count;
        }
    }

    const sortedUsers = Object.entries(monthlyTotals)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const totalMessages = sortedUsers.reduce(
        (total, [, count]) => total + count,
        0
    );
const grades = GRADE_ROLE_KEYS.map(() => []);

if (totalMessages === 0) {
    return grades;
}

let cumulativeMessages = 0;

for (const [userId, count] of sortedUsers) {
    // メンバーのメッセージ数の中央位置を基準に級を決める
    const midpoint = cumulativeMessages + count / 2;

    const gradeIndex = Math.min(
        grades.length - 1,
        Math.floor((midpoint / totalMessages) * grades.length)
    );

    grades[gradeIndex].push(userId);
    cumulativeMessages += count;
}

return grades;
}

async function updateGuildMonthlyGrades(client, guildId, now = new Date()) {
    const guildData = loadGuildData(guildId);
    const grades = calculateMonthlyGrades(guildData.logs, now);
    const guild = await client.guilds.fetch(guildId);
    const changes = [];
    const gradeMemberNames = GRADE_ROLE_KEYS.map(() => []);

    for (let gradeIndex = 0; gradeIndex < GRADE_ROLE_KEYS.length; gradeIndex++) {
        const roleId = guildData.roles?.[GRADE_ROLE_KEYS[gradeIndex]];
        if (!roleId) {
            console.warn(
                `月間級ロールIDが未設定です: ${guildId}/${GRADE_ROLE_KEYS[gradeIndex]}`
            );
            continue;
        }

        const role = guild.roles.cache.get(roleId);
        if (!role) {
            console.error(
                `月間級ロールが見つかりません: ${guildId}/${GRADE_ROLE_KEYS[gradeIndex]} (${roleId})`
            );
            continue;
        }

        const userIds = grades[gradeIndex];
        const userIdSet = new Set(userIds);

        for (const member of role.members.values()) {
            if (!userIdSet.has(member.id)) {
                try {
                    await member.roles.remove(role);
                    changes.push(`${member.user.tag} から「${role.name}」を削除`);
                } catch (error) {
                    console.error(
                        `月間級ロール削除失敗: ${member.user.tag} (${role.name})`
                    );
                }
            }
        }

        for (const userId of userIds) {
            let member;
            try {
                member = await guild.members.fetch(userId);
            } catch (error) {
                console.error(
                    `月間級ロール付与対象の取得失敗: ${userId} (${role.name})`
                );
                continue;
            }

            gradeMemberNames[gradeIndex].push(
                member.displayName.replace(/[\r\n]+/g, " ")
            );

            if (!member.roles.cache.has(role.id)) {
                try {
                    await member.roles.add(role);
                    changes.push(userId);
                } catch (error) {
                    console.error(
                        `月間級ロール付与失敗: ${member.user.tag} (${role.name})`,
                        error
                    );
                }
            }
        }
    }

    if (changes.length === 0) return;

    const logChannelId = serverLogs[guildId]?.messagelog;
    if (!logChannelId) {
        console.warn(`月間級ロール変更通知先が未設定です: ${guildId}`);
        return;
    }

    let channel;
    try {
        channel = await guild.channels.fetch(logChannelId);
    } catch (error) {
        console.error(`月間級ロール変更通知先の取得失敗: ${guildId}`);
        return;
    }

    if (!channel?.isTextBased() || typeof channel.send !== "function") {
        console.error(`月間級ロール変更通知先がテキストチャンネルではありません: ${guildId}/${logChannelId}`);
        return;
    }

    const descriptionChunks = [];
    let description = "";
    for (let gradeIndex = 0; gradeIndex < gradeMemberNames.length; gradeIndex++) {
        const names = gradeMemberNames[gradeIndex];
        if (names.length === 0) continue;

        const heading = `${gradeIndex + 1}級`;
        let section = heading;
        for (const name of names) {
            const nextLine = `${section}\n${name}`;
            if (nextLine.length > 3500 && section !== heading) {
                const nextDescription = description
                    ? `${description}\n\n${section}`
                    : section;
                if (nextDescription.length > 3500) {
                    descriptionChunks.push(description);
                    description = section;
                } else {
                    description = nextDescription;
                }
                section = `${heading}\n${name}`;
            } else {
                section = nextLine;
            }
        }

        const nextDescription = description
            ? `${description}\n\n${section}`
            : section;
        if (nextDescription.length > 3500) {
            descriptionChunks.push(description);
            description = section;
        } else {
            description = nextDescription;
        }
    }
    if (description) descriptionChunks.push(description);

    for (let index = 0; index < descriptionChunks.length; index++) {
        const embed = new EmbedBuilder()
            .setTitle("草餅検定")
            .setDescription(descriptionChunks[index])
            .setColor(0x00BFFF)
            .setTimestamp();
        if (descriptionChunks.length > 1) {
            embed.setFooter({
                text: `${index + 1}/${descriptionChunks.length}`
            });
        }

        try {
            await channel.send({
                embeds: [embed],
                allowedMentions: { parse: [] }
            });
        } catch (error) {
            console.error(`月間級ロール変更通知の送信失敗: ${guildId}`);
        }
    }
}

let dailyGradeUpdateTimer = null;

function startDailyGradeUpdates(client) {
    if (dailyGradeUpdateTimer) return;

    const scheduleNextUpdate = () => {
        const now = new Date();
        const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
        const nextMidnight = Date.UTC(
            jstNow.getUTCFullYear(),
            jstNow.getUTCMonth(),
            jstNow.getUTCDate() + 1
        ) - JST_OFFSET_MS;

        dailyGradeUpdateTimer = setTimeout(async () => {
            dailyGradeUpdateTimer = null;
            for (const guildId of client.guilds.cache.keys()) {
                try {
                    await updateGuildMonthlyGrades(client, guildId);
                } catch (error) {
                    console.error(`月間級ロール更新失敗: ${guildId}`, error);
                }
            }
            scheduleNextUpdate();
        }, nextMidnight - now.getTime());
    };

    scheduleNextUpdate();
}


module.exports = {
    calculateMonthlyGrades,
    startDailyGradeUpdates,
    updateGuildMonthlyGrades
};
