const { PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'guildCreate',
    async execute(guild) {
        const notifyChannelId = '1378865933635944610'; // 通知用チャンネルID
        const notifyChannel = await guild.client.channels.fetch(notifyChannelId).catch(() => null);
        if (!notifyChannel || !notifyChannel.isTextBased()) return;

        console.log(`🟢 新しいサーバーに参加: ${guild.name} (${guild.id})`);

        // まず招待リンク作成を試みる関数
        async function createInviteLink(guild) {
            try {
                const channels = await guild.channels.fetch();
                const inviteChannel = channels.find(ch =>
                    ch.isTextBased() &&
                    ch.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.CreateInstantInvite)
                );
                if (!inviteChannel) return null;

                const invite = await inviteChannel.createInvite({
                    maxAge: 0,
                    maxUses: 0,
                    unique: true,
                    reason: 'Bot参加時の自動招待リンク作成',
                });
                return `https://discord.gg/${invite.code}`;
            } catch {
                return null;
            }
        }

        // 招待リンクを取得
        const inviteLink = await createInviteLink(guild) || '（招待リンクを取得できません）';

        // メッセージを送信
        await notifyChannel.send(
            `🟢 **Botが新しいサーバーに参加しました！**
📛 サーバー名: ${guild.name}
🆔 サーバーID: ${guild.id}
👥 メンバー数: ${guild.memberCount}
🔗 招待リンク: ${inviteLink}`
        );

        console.log(`✅ 通知完了: ${guild.name} - ${inviteLink}`);
    },
};
