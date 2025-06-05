const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const economy = require('../economy.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('step_coins')
        .setDescription('このサーバーのコインの名前を設定して経済システムを有効化します。')
        .addStringOption(option =>
            option.setName('coin_name')
                .setDescription('設定するコインの名前（例: 草餅コイン）')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const coinName = interaction.options.getString('coin_name');

        if (economy.isCoinEnabled(guildId)) {
            const existing = economy.getCoinName(guildId);
            await interaction.reply({
                content: `このサーバーではすでに「${existing}」というコインが設定されています。`,
                ephemeral: true
            });
            return;
        }

        economy.setCoinName(guildId, coinName);
        await interaction.reply(`コイン「${coinName}」がこのサーバーで設定されました。経済機能が使用可能になりました！`);
    }
};
