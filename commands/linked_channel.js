const { SlashCommandBuilder, ChannelType, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const channelLinksDirectory = path.join(__dirname, '..', 'data', 'channel_links');
const LINKABLE_CHANNEL_TYPES = new Set([
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
    ChannelType.GuildMedia
].filter(type => type !== undefined));

function getLinkedDestination(link, defaultGuildId) {
    if (typeof link !== 'string' || !link.trim()) return null;

    const parts = link.split('/').filter(Boolean);
    if (parts.length === 1 && /^\d+$/.test(parts[0])) {
        return { guildId: defaultGuildId, channelId: parts[0] };
    }
    if (parts.length === 2 && parts.every(part => /^\d+$/.test(part))) {
        return { guildId: parts[0], channelId: parts[1] };
    }
    return null;
}

function splitLines(lines, maxLength = 1000) {
    const chunks = [];
    let current = '';

    for (const line of lines) {
        const next = current ? `${current}\n${line}` : line;
        if (next.length > maxLength && current) {
            chunks.push(current);
            current = line;
        } else {
            current = next;
        }
    }

    if (current) chunks.push(current);
    return chunks;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('linked_channel')
        .setDescription('このサーバーのリンク済み・未リンクチャンネルを表示します'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        if (!guild) {
            return interaction.editReply('このコマンドはサーバー内で実行してください。');
        }

        try {
            const filePath = path.join(channelLinksDirectory, `${guild.id}.json`);
            let channelData = {};

            if (fs.existsSync(filePath)) {
                channelData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                if (!channelData || typeof channelData !== 'object' || Array.isArray(channelData)) {
                    throw new Error('チャンネルリンク設定の形式が不正です。');
                }
            }

            const channels = await guild.channels.fetch();
            const linkableChannels = [...channels.values()]
                .filter(channel => channel &&
                    LINKABLE_CHANNEL_TYPES.has(channel.type) &&
                    typeof channel.createWebhook === 'function')
                .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

            const linked = [];
            const unlinked = [];

            for (const channel of linkableChannels) {
                const record = channelData[channel.id];
                const destination = getLinkedDestination(record?.links ?? record?.link, guild.id);

                if (destination) {
                    const destinationText = destination.guildId === guild.id
                        ? `<#${destination.channelId}>`
                        : `<#${destination.channelId}> (サーバーID: ${destination.guildId})`;
                    linked.push(`<#${channel.id}> → ${destinationText}`);
                } else {
                    unlinked.push(`<#${channel.id}>`);
                }
            }

            const linkedChunks = splitLines(linked.length ? linked : ['なし']);
            const unlinkedChunks = splitLines(unlinked.length ? unlinked : ['なし']);
            const pageCount = Math.max(linkedChunks.length, unlinkedChunks.length);
            const embeds = [];

            for (let page = 0; page < pageCount; page++) {
                embeds.push(new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle(`${guild.name} のチャンネルリンク一覧`.slice(0, 256))
                    .setDescription(`リンク済み: **${linked.length}** / 未リンク: **${unlinked.length}**${pageCount > 1 ? `\nページ ${page + 1}/${pageCount}` : ''}`)
                    .addFields(
                        {
                            name: `リンク済みチャンネル (${linked.length})`,
                            value: linkedChunks[page] || '—',
                            inline: false
                        },
                        {
                            name: `未リンクチャンネル (${unlinked.length})`,
                            value: unlinkedChunks[page] || '—',
                            inline: false
                        }
                    ));
            }

            await interaction.editReply({ embeds: [embeds[0]] });
            for (const embed of embeds.slice(1)) {
                await interaction.followUp({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            console.error('リンクチャンネル一覧の取得に失敗しました:', error);
            await interaction.editReply('チャンネル一覧またはリンク設定を読み込めませんでした。');
        }
    }
};
