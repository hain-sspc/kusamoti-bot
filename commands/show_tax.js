const { SlashCommandBuilder } = require('discord.js');
const { getCoinName, loadEconomy } = require('../systems/economy');

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('show_tax')
        .setDescription('税金を確認します'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        const guildId = interaction.guildId;
        const eco = loadEconomy();  // ファイルから全体データを取得
        const guildData = eco.guilds[guildId] || {};
        const tax = guildData.tax || 0;
        const coinName = getCoinName(guildId) || 'コイン';

        await interaction.editReply(`このサーバーの税金は ${tax} ${coinName} です。`);
    }

};
