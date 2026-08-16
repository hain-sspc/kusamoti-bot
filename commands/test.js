const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    devOnly: true,
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('てすと'),
       

    async execute(interaction) {
        await interaction.reply("テスト");
        console.log("コマンドが実行された！")
    },
};
