const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaveguild')
        .setDescription('指定したサーバーからボットを退出させます')
        .addStringOption(option =>
            option.setName('guild_id')
                .setDescription('退出するサーバーのID')
                .setRequired(true)),

    async execute(interaction) {
        const allowedGuildId = '1300434664347144262';

        // 実行元が特定サーバーかどうか確認
        if (interaction.guildId !== allowedGuildId) {
            return await interaction.reply({ content: 'このコマンドは草餅過激派連合軍の幹部のみ使用できます。', ephemeral: true });
        }

        // 実行者が管理者かどうか確認
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return await interaction.reply({ content: 'このコマンドは管理者のみ使用できます。', ephemeral: true });
        }

        const guildId = interaction.options.getString('guild_id');
        const targetGuild = interaction.client.guilds.cache.get(guildId);

        if (!targetGuild) {
            return await interaction.reply({ content: 'そのIDのサーバーには参加していません。', ephemeral: true });
        }

        await targetGuild.leave();

        // interaction.channel.send ではなく interaction.followUp を推奨
        await interaction.channel.send(`✅ サーバー **${targetGuild.name}** (${targetGuild.id}) から退出しました。実行者: ${interaction.user.tag}`);
    },
};
