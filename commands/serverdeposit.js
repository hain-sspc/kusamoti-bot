const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
    loadEconomy,
    saveEconomy,
    getGuildData,
    addBalance,
    setCoinName,
    getCoinName,
    serverbankbalance
} = require('../systems/economy');

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('serverdeposit')
        .setDescription('このサーバーの全預金額の合計を表示します。'),
     

    async execute(interaction) {
        try {
            const guildId = interaction.guild.id;
            const eco = loadEconomy();
            const coinName = getCoinName(guildId);
            const list = serverbankbalance(eco, guildId);
            const total = list.reduce((sum, u) => sum + u.deposit, 0);

           

            await interaction.reply(
                `${total} ${coinName}`
            );

        } catch (err) {
            console.error(err);

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp("エラーが発生しました");
            } else {
                await interaction.reply("エラーが発生しました");
            }
        }
    }

};
