const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('servers')
        .setDescription('Botが参加しているサーバーの招待リンクを生成します（管理者専用）'),

    async execute(interaction) {
        await interaction.deferReply();

        const client = interaction.client;
        const lines = []; // 各サーバー情報を格納

        for (const [guildId, guild] of client.guilds.cache) {
            try {
                const channels = await guild.channels.fetch();
                const inviteChannel = channels.find(ch =>
                    ch.isTextBased() &&
                    ch.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.CreateInstantInvite)
                );

                if (!inviteChannel) {
                    lines.push(` **${guild.name} (${guildId})**\n招待リンクなし`);
                    continue;
                }

                const invite = await inviteChannel.createInvite({
                    maxAge: 0,
                    maxUses: 0,
                    unique: true,
                    reason: 'Botによる招待リンク生成',
                });

                lines.push(`**${guild.name} (${guildId})**\nhttps://discord.gg/${invite.code}`);
            } catch (error) {
                lines.push(` ${guild.name} (${guildId}): エラー - ${error.message}`);
            }
        }

        // lines を 2000 文字以内で分割して embed 作成
        const embedChunks = splitLinesToEmbeds(lines);

        // 最初の1個は editReply、それ以降は followUp
        if (embedChunks.length > 0) {
            await interaction.editReply({ embeds: [embedChunks[0]] });
            for (let i = 1; i < embedChunks.length; i++) {
                await interaction.followUp({ embeds: [embedChunks[i]] });
            }
        } else {
            await interaction.editReply({ content: 'サーバー情報が見つかりませんでした。' });
        }
    },
};

// lines を最大 2000 文字ごとに embed に分割
function splitLinesToEmbeds(lines, maxLength = 2000) {
    const embeds = [];
    let current = '';

    for (const line of lines) {
        if ((current + '\n' + line).length > maxLength) {
            embeds.push(new EmbedBuilder()
                .setTitle('参加サーバー')
                .setDescription(current)
                .setColor('Blue')
                .setTimestamp()
            );
            current = line;
        } else {
            current += (current ? '\n' : '') + line;
        }
    }

    if (current) {
        embeds.push(new EmbedBuilder()
            .setTitle('参加サーバー')
            .setDescription(current)
            .setColor('Blue')
            .setTimestamp()
        );
    }

    return embeds;
}
