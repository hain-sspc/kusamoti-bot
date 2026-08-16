const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadEconomy, saveEconomy, getUserEc, addServerTax, getCoinName } = require('../systems/economy');

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('pay_tax')
        .setDescription('指定した金額を税金として納めます。')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('納める金額')
                .setRequired(true)),
    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        const amount = interaction.options.getInteger('amount');

        if (amount <= 0) {
            await interaction.reply({ content: '納める金額は正の整数で指定してください。', ephemeral: true });
            return;
        }

        const eco = loadEconomy();
        const user = getUserEc(eco, guildId, userId);
        const coinName = getCoinName(guildId) || 'コイン';

        if (user.balance < amount) {
            await interaction.reply({ content: `残高不足です。あなたの所持金: ${user.balance}`, ephemeral: true });
            return;
        }

        user.balance -= amount;
        addServerTax(eco, guildId, amount);
        saveEconomy(eco);

        const embed = new EmbedBuilder()
            .setTitle('納税完了')
            .setColor(0xFFA500)
            .setDescription(`${amount} ${coinName} を税金として納めました。`)
            .addFields(
                { name: '残高', value: `${user.balance} ${coinName}`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
