const { SlashCommandBuilder } = require('discord.js');
const { loadEconomy, saveEconomy, getUserEc, getGuildData, getCoinName } = require('../economy');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('exchange')
        .setDescription('他のサーバーのコインと交換します')
        .addStringOption(option =>
            option.setName('target_guild_id')
                .setDescription('交換先のサーバーID')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('交換する自サーバーのコイン数')
                .setRequired(true)),
    async execute(interaction) {
        const fromGuildId = interaction.guild.id;
        const toGuildId = interaction.options.getString('target_guild_id');
        const amount = interaction.options.getInteger('amount');
        const userId = interaction.user.id;

        if (fromGuildId === toGuildId) {
            return interaction.reply({ content: '同じサーバー間で交換はできません。', ephemeral: true });
        }

        const eco = loadEconomy();

        const fromUser = getUserEc(eco, fromGuildId, userId);
        const toUser = getUserEc(eco, toGuildId, userId);
        const fromGuild = getGuildData(eco, fromGuildId);
        const toGuild = getGuildData(eco, toGuildId);

        fromUser.balance = fromUser.balance || 0;
        toUser.balance = toUser.balance || 0;

        if (fromUser.balance < amount) {
            return interaction.reply({ content: '残高が不足しています。', ephemeral: true });
        }

        // 各ギルドのコインの総量に基づくレート（例: a / b）
        const fromTotal = fromGuild.totalBalance || 1;
        const toTotal = toGuild.totalBalance || 1;

        if (toTotal === 0) {
            return interaction.reply({ content: '一方のサーバーに供給がありません。', ephemeral: true });
        }

        const rate = toTotal / fromTotal;
        const received = Math.floor(amount * rate);

        fromUser.balance -= amount;
        fromGuild.totalBalance -= amount;

        toUser.balance += received;
        toGuild.totalBalance += received;

        saveEconomy(eco);

        const fromCoin = getCoinName(fromGuildId) || 'Aコイン';
        const toCoin = getCoinName(toGuildId) || 'Bコイン';

        return interaction.reply({
            content:
                `交換完了！\n` +
                `• 支払: ${amount} ${fromCoin}\n` +
                `• 受取: ${received} ${toCoin}（レート: ${rate.toFixed(3)}）`,
            ephemeral: false
        });
    }
};
