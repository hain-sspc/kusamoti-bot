const log = require("../data/serverlog.json");
const invitesCache = require("../data/invitesCache");
const { EmbedBuilder } = require("discord.js");

module.exports = {
    name: "guildMemberAdd",
    once: false,

    async execute(member, client) {
        const serverid = member.guild.id;
        const LOG_CHANNEL_ID = log[serverid]?.memberlog;

        if (!LOG_CHANNEL_ID) return;

        const logChannel = await client.channels
            .fetch(LOG_CHANNEL_ID)
            .catch(() => null);

        if (!logChannel || !logChannel.isTextBased()) return;

        let usedInvite = null;

        try {
            const oldInvites =
                invitesCache.get(serverid) || new Map();

            const newInvites =
                await member.guild.invites.fetch();

            for (const invite of newInvites.values()) {
                const oldInvite =
                    oldInvites.get(invite.code);

                if (
                    oldInvite &&
                    (invite.uses ?? 0) > oldInvite.uses
                ) {
                    usedInvite = invite;
                    break;
                }
            }

            // 最新の招待情報を保存
            const inviteMap = new Map();

            for (const invite of newInvites.values()) {
                inviteMap.set(invite.code, {
                    uses: invite.uses ?? 0
                });
            }

            invitesCache.set(serverid, inviteMap);

        } catch (error) {
            console.error(
                "招待情報取得失敗:",
                error
            );
        }

        const inviteUrl = usedInvite
            ? `https://discord.gg/${usedInvite.code}`
            : "取得できませんでした";

        const inviter = usedInvite?.inviter
            ? `${usedInvite.inviter.tag}\n<@${usedInvite.inviter.id}>`
            : "取得できませんでした";

        const inviteUses = usedInvite
            ? `${usedInvite.uses ?? 0}回`
            : "取得できませんでした";

        const embed = new EmbedBuilder()
            .setTitle("メンバーが参加しました")
            .setColor("Green")
            .setThumbnail(
                member.user.displayAvatarURL({
                    dynamic: true
                })
            )
            .addFields(
                {
                    name: "ユーザー",
                    value: `<@${ member.user.id }>`,
                    inline: true
                },
                {
                    name: "ユーザーID",
                    value: member.id,
                    inline: true
                },
                {
                    name: "メンバー数",
                    value: `${member.guild.memberCount}`,
                    inline: true
                },
                {
                    name: "招待URL",
                    value: inviteUrl,
                    inline: false
                },
                {
                    name: "招待作成者",
                    value: inviter,
                    inline: true
                },
                {
                    name: "招待使用回数",
                    value: inviteUses,
                    inline: true
                }
            )
            .setTimestamp();

        await logChannel.send({
            embeds: [embed]
        }).catch(error => {
            console.error(
                "メンバー加入ログ送信失敗:",
                error
            );
        });
    }
};