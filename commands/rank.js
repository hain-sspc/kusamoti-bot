const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const{ loadGuildData} = require("../messageLogger");
//const DATA_PATH = path.join(__dirname, "../data/messagecount");

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName("rank")
        .setDescription("雑談王"),

    async execute(interaction) {

        await interaction.deferReply();

        const GUILD_ID = interaction.guild.id;

    

        const raw = loadGuildData(GUILD_ID)
        const guildData = raw.logs;

        if (!guildData) {
            return interaction.editReply("このサーバーのデータがありません。");
        }

        const records = Object.entries(guildData)
            .map(([time, data]) => {
                const date = new Date(time);
                if (isNaN(date)) return null;

                return {
                    time: date,
                    users: data.users || {}
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.time - b.time);

        const allDates = [...new Set(
            records.map(r => r.time.toISOString().slice(0, 10))
        )].sort();

        const dailyKings = [];

        for (const dateStr of allDates) {

            const dayEnd = new Date(dateStr + "T23:59:59");

            const shortTotals = {};
            const longTotals = {};

            for (const record of records) {
                const diff = dayEnd - record.time;
                if (diff < 0) continue;

                for (const [userId, count] of Object.entries(record.users)) {

                    if (diff <= 24 * 60 * 60 * 1000) {
                        shortTotals[userId] ??= 0;
                        shortTotals[userId] += count;
                    }

                    if (diff <= 72 * 60 * 60 * 1000) {
                        longTotals[userId] ??= 0;
                        longTotals[userId] += count;
                    }
                }
            }

            const shortTop = Object.entries(shortTotals)
                .sort((a, b) => b[1] - a[1])[0]?.[0];

            const longTop = Object.entries(longTotals)
                .sort((a, b) => b[1] - a[1])[0]?.[0];

            if (shortTop && longTop && shortTop === longTop) {
                dailyKings.push({ date: dateStr, userId: shortTop });
            } else {
                dailyKings.push({ date: dateStr, userId: null });
            }
        }

        // ===== 世代まとめ =====
        const generations = [];

        for (const entry of dailyKings) {

            if (!entry.userId) continue;

            const last = generations[generations.length - 1];

            if (!last || last.userId !== entry.userId) {
                generations.push({
                    userId: entry.userId,
                    start: entry.date,
                    end: entry.date
                });
            } else {
                last.end = entry.date;
            }
        }

        if (generations.length === 0) {
            return interaction.editReply("まだ雑談王が誕生していません。");
        }

        // ===== Embed作成 =====
        const embed = new EmbedBuilder()
            .setTitle("歴代雑談王")
            .setColor(0xFFD700)
            .setTimestamp();

        for (let i = 0; i < generations.length; i++) {

            const g = generations[i];

            const member = await interaction.guild.members
                .fetch(g.userId)
                .catch(() => null);

            const name = member ? member.user.tag : g.userId;

            embed.addFields({
                name: `${i + 1}代目`,
                value: `${name}\n${g.start} ~ ${g.end}`,
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });
    }
};