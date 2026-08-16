// commands/ticket.js
const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('チケット作成ボタンを表示します')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addStringOption(option =>
            option.setName('title')
                .setDescription('タイトルです')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('メッセージです')),
       
    async execute(interaction) {
        const title = interaction.options.getString('title')
        const message = interaction.options.getString('message')
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(message)
            .setColor('Blue');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('create_ticket')
                .setLabel('作成する')
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
    }
};
