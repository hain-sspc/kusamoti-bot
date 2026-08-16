const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('deletechannel')
        .setDescription('指定したチャンネルIDのチャンネルを削除します')
        .addStringOption(option =>
            option.setName('id')
                .setDescription('削除するチャンネルのID')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const channelId = interaction.options.getString('id');
        const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

        if (!channel) {
            return interaction.reply({ content: '❌ チャンネルが見つかりませんでした。', ephemeral: true });
        }

        try {
            await channel.delete();
            await interaction.reply(`チャンネル「${channel.name}」を削除しました`);
        } catch (err) {
            console.error(err);
            await interaction.reply({ content: '❌ 削除に失敗しました。', ephemeral: true });
        }
    }
};
