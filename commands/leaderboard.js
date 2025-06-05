const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getCoinName } = require('../economy');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('所持金ランキングを表示します'),
    async execute(interaction) {
        try {
            await interaction.deferReply(); // 応答を延期

            const guildId = interaction.guildId;
            const economyPath = "C:/Users/81904/SpartanX/data/economy.json";
            const economyData = JSON.parse(fs.readFileSync(economyPath, 'utf8'));

            const guildData = economyData.guilds?.[guildId];
            if (!guildData || !guildData.users) {
                return interaction.editReply('このサーバーには経済データがありません。/step_coinsで設定してください');
            }

            const sorted = Object.entries(guildData.users)
                .map(([userId, data]) => ({
                    userId,
                    balance: data.balance || 0
                }))
                .sort((a, b) => b.balance - a.balance)
                .slice(0, 10);

            const coinName = getCoinName(guildId) || 'コイン';

            let description = '';
            for (let i = 0; i < sorted.length; i++) {
                const { userId, balance } = sorted[i];
                const user = await interaction.client.users.fetch(userId).catch(() => null);
                const username = user ? user.tag : '不明なユーザー';
                description += `**${i + 1}. ${username}** — 💰 ${balance} ${coinName}\n`;
            }

            await interaction.editReply({
                embeds: [{
                    title: '🏆 所持金ランキング',
                    description: description || 'ランキングデータがありません。',
                    color: 0xFFD700,
                }],
            });
        } catch (error) {
            console.error(error);
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: 'エラーが発生しました。', ephemeral: true });
            } else {
                await interaction.reply({ content: 'エラーが発生しました。', ephemeral: true });
            }
        }
    },
};
