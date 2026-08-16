const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/reaction.json');

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('reactionrank')
        .setDescription('過去24時間のリアクション数ランキングを表示します'),

    async execute(interaction) {
        await interaction.deferReply();

        const guildId = interaction.guild.id;
        const since = Date.now() - 24 * 60 * 60 * 1000;

        if (!fs.existsSync(DATA_PATH)) {
            return interaction.editReply('データがありません。');
        }

        const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
        const guildData = raw[guildId];

        if (!guildData) {
            return interaction.editReply('このサーバーのデータはありません。');
        }

        const userCounts = new Map();
        let totalMessages = 0;

        for (const [timeKey, data] of Object.entries(guildData)) {

            // 🔑 日単位キーは無視（24時間集計は分単位のみ）
            if (!timeKey.includes('T')) continue;

            const time = new Date(timeKey).getTime();
            if (isNaN(time) || time < since) continue;

            totalMessages += data.total;

            for (const [userId, count] of Object.entries(data.users)) {
                userCounts.set(
                    userId,
                    (userCounts.get(userId) || 0) + count
                );
            }
        }

        if (userCounts.size === 0) {
            return interaction.editReply('過去24時間のリアクションはありません。');
        }

        const ranking = [...userCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        const description = await Promise.all(
            ranking.map(async ([userId, count], i) => {
                const user = await interaction.client.users
                    .fetch(userId)
                    .catch(() => null);

                const name = user ? user.username : `Unknown (${userId})`;

                return `**${i + 1}位** ${name} — **${count}**`;
            })
        );

        const embed = new EmbedBuilder()
            .setTitle('リアクションランキング（過去24時間）')
            .setDescription(description.join('\n'))
            .addFields({
                name: 'サーバー合計',
                value: `**${totalMessages}**`,
                inline: false
            })
            .setColor(0x00bfff)
            .setFooter({
                text: `集計開始: ${new Date(since).toLocaleString('ja-JP')}`
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};
