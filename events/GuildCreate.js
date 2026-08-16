const { EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'guildCreate',
    once: false,

    async execute(guild, client) {
        const notifyChannelId =
            process.env.NOTIFY_CHANNEL_ID || '1460503473907826855';

        const notifyChannel = await client.channels
            .fetch(notifyChannelId)
            .catch(() => null);

        if (!notifyChannel || !notifyChannel.isTextBased()) return;

        console.log(
            `新しいサーバーに参加: ${guild.name} (${guild.id})`
        );

        const botMember = await guild.members.fetchMe().catch(() => null);

        if (!botMember) {
            return console.warn(
                `Bot自身の情報が取得できません: ${guild.id}`
            );
        }

        async function createInviteLinkWithRetry(maxTries = 3) {
            for (let attempt = 1; attempt <= maxTries; attempt++) {
                try {
                    const channels = await guild.channels.fetch();

                    const inviteChannel = channels.find(ch =>
                        ch.isTextBased() &&
                        ch
                            .permissionsFor(botMember)
                            ?.has(
                                PermissionsBitField.Flags.CreateInstantInvite
                            )
                    );

                    if (!inviteChannel) {
                        console.warn(
                            `招待リンクを作成できるチャンネルが見つかりません（試行${attempt}）`
                        );
                        continue;
                    }

                    const invite = await inviteChannel.createInvite({
                        maxAge: 0,
                        maxUses: 0,
                        unique: true,
                        reason: 'Bot参加時の自動招待リンク作成',
                    });

                    return `https://discord.gg/${invite.code}`;
                } catch (error) {
                    console.warn(
                        `❌ 招待リンク作成失敗（試行${attempt}）:`,
                        error.message
                    );

                    await new Promise(resolve =>
                        setTimeout(resolve, 1000 * attempt)
                    );
                }
            }

            return '（招待リンクを取得できません）';
        }

        const inviteLink = await createInviteLinkWithRetry();

        const embed = new EmbedBuilder()
            .setTitle('Botが新しいサーバーに参加しました！')
            .setColor('Green')
            .addFields(
                {
                    name: 'サーバー名',
                    value: guild.name,
                    inline: true,
                },
                {
                    name: 'サーバーID',
                    value: guild.id,
                    inline: true,
                },
                {
                    name: 'メンバー数',
                    value: `${guild.memberCount}`,
                    inline: true,
                },
                {
                    name: '招待リンク',
                    value: inviteLink,
                }
            )
            .setTimestamp();

        await notifyChannel.send({
            embeds: [embed],
        });

        console.log(
            `通知完了: ${guild.name} - ${inviteLink}`
        );
    },
};