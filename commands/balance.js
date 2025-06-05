const { SlashCommandBuilder } = require('discord.js');
const { getBalance, getCoinName } = require('../economy');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('自分の所持金を確認します'),
    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        const balance = getBalance(guildId, userId);
        const coinName = getCoinName(guildId) || 'コイン';

        await interaction.reply(`あなたの所持金は ${balance} ${coinName} です。`);
    },
};
