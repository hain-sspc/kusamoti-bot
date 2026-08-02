const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    devOnly: true,
    data: new SlashCommandBuilder()
        .setName('set_limit')
        .setDescription('antinukeのlimitを設定します'),


    async execute(interaction) {
        await interaction.reply("テスト");
        console.log("テスト")
    },
};
