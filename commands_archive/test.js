const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('てすと'),
       

    async execute(interaction) {
        await interaction.reply("テスト");
        console.log("コマンドが実行された！")
    },
};
