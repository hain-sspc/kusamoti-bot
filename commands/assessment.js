const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getUserEc, saveEconomy, loadEconomy, getCoinName } = require('../systems/economy');

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('assessment')
        .setDescription('査定をします(管理者専用)')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('査定するユーザー')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('査定額')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const BOT_ID = "1352207314349981737";
        const senderId = BOT_ID;
        const target = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');
        const guildId = interaction.guildId;
        const eco = loadEconomy();

        const sender = getUserEc(eco, guildId, senderId);
        const receiver = getUserEc(eco, guildId, target.id);
        const coinName = getCoinName(guildId) || 'コイン';
        
        if (amount <= 0) {
            return interaction.reply({ content: '査定額は1以上で指定してください。', ephemeral: true });
        }

        if (target.id === senderId) {
            return interaction.reply({ content: '自分自身には査定できません。', ephemeral: true });
        }

        sender.balance = sender.balance || 0;
        receiver.balance = receiver.balance || 0;

       
        const totalCost = amount;

        if (sender.balance < totalCost) {
            return interaction.reply({ content: `金が足りません。`, ephemeral: true });
        }

        sender.balance -= totalCost;
        receiver.balance += amount;
        saveEconomy(eco);

        const embed = new EmbedBuilder()
            .setTitle('査定完了')
            .setColor(0x00FF00)
            .addFields(
                { name: '査定額', value: `${amount.toFixed(2)} ${coinName}`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
