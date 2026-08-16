const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserEc, saveEconomy, loadEconomy, getCoinName, loadTaxRate, addServerTax } = require('../systems/economy');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('他のユーザーにコインを送金します')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('送金相手')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('送金額')
                .setRequired(true)),
    async execute(interaction) {
        const senderId = interaction.user.id;
        const target = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');
        const guildId = interaction.guildId;
        const eco = loadEconomy();

        const sender = getUserEc(eco, guildId, senderId);
        const receiver = getUserEc(eco, guildId, target.id);
        const coinName = getCoinName(guildId) || 'コイン';
        const taxRate = loadTaxRate().payTaxRate || 0.1;

        if (amount <= 0) {
            return interaction.reply({ content: '金額は1以上で指定してください。', ephemeral: true });
        }

        if (target.id === senderId) {
            return interaction.reply({ content: '自分自身には送金できません。', ephemeral: true });
        }

        sender.balance = sender.balance || 0;
        receiver.balance = receiver.balance || 0;

        const tax = amount * taxRate;
        const totalCost = amount + tax;

        if (sender.balance < totalCost) {
            return interaction.reply({ content: `送金額と税金を合わせた **${totalCost.toFixed(2)} ${coinName}** を支払う必要があります。所持金が足りません。`, ephemeral: true });
        }

        sender.balance -= totalCost;
        receiver.balance += amount;
        addServerTax(eco, guildId, tax);
        saveEconomy(eco);

        const embed = new EmbedBuilder()
            .setTitle('送金完了！')
            .setColor(0x00FF00)
            .addFields(
                { name: '送金先', value: target.tag, inline: true },
                { name: '送金額', value: `${amount.toFixed(2)} ${coinName}`, inline: true },
                { name: '税金', value: `${tax.toFixed(2)} ${coinName}`, inline: true },
                { name: '支払額合計', value: `${totalCost.toFixed(2)} ${coinName}`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
