const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadEconomy, saveEconomy, getUserEc, getCoinName } = require('../systems/economy');

const BANK_USER_ID = '1352207314349981737';

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('bank-withdraw')
        .setDescription('銀行からコインを引き出します')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('引き出す金額')
                .setRequired(true)
                .setMinValue(1)
        ),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        const amount = interaction.options.getInteger('amount');

        const eco = loadEconomy();
        const coinName = getCoinName(guildId) || 'コイン';

        const user = getUserEc(eco, guildId, userId);
        const bankUser = getUserEc(eco, guildId, BANK_USER_ID);

        if (!user.bank) {
            user.bank = { deposit: 0, lastInterest: Date.now() };
        }

        // 預金チェック
        if (user.bank.deposit < amount) {
            return interaction.reply({
                content: `🏦 預金が足りません（現在 ${user.bank.deposit} ${coinName}）`,
                ephemeral: true,
            });
        }

        // 銀行の現金チェック
        if (bankUser.balance < amount) {
            return interaction.reply({
                content: `🏦 銀行の現金が不足しています。現在 ${bankUser.balance} ${coinName}`,
                ephemeral: true,
            });
        }

        // 引き出し処理
        user.bank.deposit -= amount;
        user.balance += amount;
        bankUser.balance -= amount;

        saveEconomy(eco);

        const embed = new EmbedBuilder()
            .setTitle('🏧 引き出し完了')
            .setColor(0xff9900)
            .addFields(
                { name: '引き出し額', value: `${amount} ${coinName}`, inline: true },
                { name: '預金残高', value: `${user.bank.deposit} ${coinName}`, inline: true },
                { name: '所持金', value: `${user.balance} ${coinName}`, inline: true },
                { name: '銀行残高', value: `${bankUser.balance} ${coinName}`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
