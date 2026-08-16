const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadTaxRate, saveTaxRate } = require('../systems/economy');

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('tax')
        .setDescription('税率設定')
        .addSubcommand(s =>
            s.setName('set')
                .setDescription('税率を設定')
                .addNumberOption(o =>
                    o.setName('rate')
                        .setDescription('税率（%）')
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const ratePercent = interaction.options.getNumber('rate');
        if (ratePercent < 0 || ratePercent > 100) {
            return interaction.reply({ content: '0〜100の範囲で指定してください', ephemeral: true });
        }

        const rates = loadTaxRate();
        rates[interaction.guild.id] = ratePercent / 100;
        saveTaxRate(rates);

        return interaction.reply(`税率を **${ratePercent}%** に設定しました`);
    }
};

