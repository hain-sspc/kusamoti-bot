const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('認証パネルを作成')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('付与するロール')
                .setRequired(true)

    )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {

        const role = interaction.options.getRole('role');

        const embed = new EmbedBuilder()
            .setTitle("認証")
            .setDescription("下のボタンを押して認証してください");

        const button = new ButtonBuilder()
            .setCustomId(`verify_${role.id}`)
            .setLabel("認証する")
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder()
            .addComponents(button);

        await interaction.reply({
            content: "認証パネルを作成しました",
            ephemeral: true
        });

        await interaction.channel.send({
            embeds: [embed],
            components: [row]
        });

    }
};