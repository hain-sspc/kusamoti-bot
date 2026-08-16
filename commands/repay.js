const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { repayDebt, loadEconomy, saveEconomy, addServerTax } = require('../systems/economy');  // loadEconomyとsaveEconomyをインポート

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('repay')
        .setDescription('借金を返済します。')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('返済する金額を指定してください。')
                .setRequired(true)),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const amount = interaction.options.getInteger('amount');

        // 経済データをロード
        const eco = loadEconomy();

        // 返済処理
        const result = repayDebt(eco, guildId, userId, amount);

        if (!result.success) {
            return interaction.reply({
                content: result.message,
                ephemeral: true
            });
        }

        // 経済データを保存
        saveEconomy(eco);
        addServerTax(eco, guildId, amount);
        const embed = new EmbedBuilder()
            .setTitle('💸 借金返済完了')
            .setDescription(result.message)
            .setColor(0x00FF00)
            .setTimestamp()
            .setFooter({
                text: '返済ありがとうございました',
                iconURL: interaction.user.displayAvatarURL()
            });

        await interaction.reply({ embeds: [embed] });
    },
};
