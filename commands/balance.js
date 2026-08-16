const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance, getCoinName, loadEconomy, getUserEc } = require('../systems/economy');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('所持金を確認します')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('表示するユーザー。指定しない場合は自分の所持金を表示します')),
    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = targetUser.id;
        const usertag = targetUser.tag;
        const guildId = interaction.guildId;

        const eco = loadEconomy(); // 経済データ読み込み
        const balance = getBalance(eco, guildId, userId); // 所持金取得
        const coinName = getCoinName(guildId) || 'コイン';
        const userData = getUserEc(eco, guildId, userId);

        const deposit = userData.bank?.deposit ?? 0;

        const embed = new EmbedBuilder()
            .setTitle(`${usertag}`)
            .setColor(0x0099ff)
            .addFields(
                { name: '所持金', value: `${balance} ${coinName}`, inline: true },
                { name: '預金残高', value: `${deposit} ${coinName}`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed]});
    },
};

