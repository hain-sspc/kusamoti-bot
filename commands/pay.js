const { SlashCommandBuilder } = require('discord.js');
const { getUserEc, saveEconomy, loadEconomy, getCoinName } = require('../economy');
const fs = require('fs');
const path = require('path');

function loadTaxRate() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'tax.json'), 'utf8'));
}

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

        if (amount <= 0) {
            return interaction.reply({ content: '金額は1以上で指定してください。', ephemeral: true });
        }

        if (target.id === senderId) {
            return interaction.reply({ content: '自分自身には送金できません。', ephemeral: true });
        }

        sender.balance = sender.balance || 0;
        receiver.balance = receiver.balance || 0;

        if (sender.balance < amount) {
            return interaction.reply({ content: ' 所持金が足りません。', ephemeral: true });
        }

        const taxRate = loadTaxRate().payTaxRate || 0.05;
        const tax = amount * taxRate;
        const amountAfterTax = amount - tax;

        sender.balance -= amount;
        receiver.balance += amountAfterTax;

        saveEconomy(eco);

        await interaction.reply(
            `💳 ${target.tag} に ${amountAfterTax.toFixed(2)} ${coinName} を送金しました。\n` +
            `• 送金額: **${amount}** ${coinName}\n` +
            `• 税金: **${tax.toFixed(2)}** ${coinName}\n` +
            `• 税引後: **${amountAfterTax.toFixed(2)}** ${coinName}`
        );
    },
};
