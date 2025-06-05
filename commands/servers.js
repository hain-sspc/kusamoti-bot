const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('servers')
        .setDescription('参加中のサーバーの招待リンクを生成します（管理者専用）'),

    async execute(interaction) {
        await interaction.deferReply();
        const client = interaction.client;
        const replyLines = [];

        for (const [guildId, guild] of client.guilds.cache) {
            try {
                const channels = await guild.channels.fetch();
                const inviteChannel = channels.find(ch =>
                    ch.isTextBased() &&
                    ch.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.CreateInstantInvite)
                );

                if (!inviteChannel) {
                    replyLines.push(`❌ ${guild.name} (${guildId}): 招待リンクを作成できるチャンネルが見つかりません`);
                    continue;
                }

                const invite = await inviteChannel.createInvite({
                    maxAge: 0,
                    maxUses: 0,
                    unique: true,
                    reason: 'Botによる自動招待リンク生成',
                });

                replyLines.push(`✅ ${guild.name} (${guildId}): https://discord.gg/${invite.code}`);
            } catch (error) {
                replyLines.push(`❌ ${guild.name} (${guildId}): エラーが発生しました - ${error.message}`);
            }
        }

        replyLines.push('🔎 すべてのサーバーをチェックしました');

        // 長文対策（分割送信）
        const chunks = splitMessage(replyLines.join('\n'));
        for (const chunk of chunks) {
            await interaction.followUp({ content: chunk });
        }
    },
};

function splitMessage(text, maxLength = 2000) {
    const lines = text.split('\n');
    const messages = [];
    let current = '';

    for (const line of lines) {
        if ((current + '\n' + line).length > maxLength) {
            messages.push(current);
            current = line;
        } else {
            current += (current ? '\n' : '') + line;
        }
    }
    if (current) messages.push(current);
    return messages;
}
