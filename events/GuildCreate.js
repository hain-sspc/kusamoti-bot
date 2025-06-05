// events/guildCreate.js
module.exports = {
    name: 'guildCreate',
    async execute(guild) {
        const channelId = '1378865933635944610'; // ここに通知先チャンネルIDを入力
        const channel = await guild.client.channels.fetch(channelId);

        if (!channel || !channel.isTextBased()) return;

        let inviteInfo = '（招待リンクを取得できません）';

        try {
            const invites = await guild.invites.fetch();
            const invite = invites.first();
            if (invite) inviteInfo = invite.url;
        } catch (e) {
            // 招待が取得できない場合は無視
        }

        await channel.send(
            `🟢 **Botが新しいサーバーに参加しました！**\n` +
            `📛 サーバー名: ${guild.name}\n` +
            `🆔 サーバーID: ${guild.id}\n` +
            `👥 メンバー数: ${guild.memberCount}\n` +
            `🔗 招待リンク: ${inviteInfo}`
        );
    },
};
