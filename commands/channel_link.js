const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const io = require('../systems/io');

const channelLinksDirectory = path.join(__dirname, '..', 'data', 'channel_links');

function getGuildFilePath(guildId) {
    return path.join(channelLinksDirectory, `${guildId}.json`);
}

function loadGuildData(guildId) {
    const filePath = getGuildFilePath(guildId);
    if (!fs.existsSync(filePath)) return {};

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error(`チャンネルリンク設定の形式が不正です: ${guildId}`);
    }
    return data;
}

function saveGuildData(guildId, data) {
    io.writeJsonSync(getGuildFilePath(guildId), data);
}

function getWebhookUrl(channelData) {
    return channelData?.webhook_url || channelData?.webhookUrl || channelData?.webhook || null;
}

function parseReference(value, defaultGuildId) {
    if (typeof value !== 'string') return null;
    const parts = value.split('/').filter(Boolean);
    if (parts.length === 1 && /^\d+$/.test(parts[0])) {
        return { guildId: defaultGuildId, channelId: parts[0] };
    }
    if (parts.length === 2 && parts.every(part => /^\d+$/.test(part))) {
        return { guildId: parts[0], channelId: parts[1] };
    }
    return null;
}

function sameReference(value, expectedGuildId, expectedChannelId, defaultGuildId) {
    const parsed = parseReference(value, defaultGuildId);
    return parsed?.guildId === expectedGuildId && parsed?.channelId === expectedChannelId;
}

function removePreviousReverseLink(dataByGuild, previousReference, ownerGuildId, ownerChannelId, newGuildId, newChannelId) {
    const previous = parseReference(previousReference, ownerGuildId);
    if (!previous || (previous.guildId === newGuildId && previous.channelId === newChannelId)) {
        return;
    }

    let previousGuildData = dataByGuild.get(previous.guildId);
    if (!previousGuildData) {
        previousGuildData = loadGuildData(previous.guildId);
        dataByGuild.set(previous.guildId, previousGuildData);
    }

    const previousRecord = previousGuildData[previous.channelId];
    if (sameReference(previousRecord?.link, ownerGuildId, ownerChannelId, previous.guildId)) {
        const updatedRecord = { ...previousRecord };
        delete updatedRecord.link;
        previousGuildData[previous.channelId] = updatedRecord;
    }
}

async function ensureWebhook(channel, channelData) {
    const configuredUrl = getWebhookUrl(channelData);
    if (configuredUrl) return configuredUrl;

    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find(item => item.name === 'ChannelLink');
    if (!webhook) {
        webhook = await channel.createWebhook({
            name: 'ChannelLink',
            reason: 'チャンネルリンク転送用Webhook'
        });
    }
    return webhook.url;
}

function formatWebhook(url) {
    return url ? `\`${url}\`` : '未登録';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('channel_link')
        .setDescription('現在のチャンネルを指定チャンネルとリンクします')
        .addStringOption(option =>
            option.setName('link')
                .setDescription('リンク先（サーバーID/チャンネルID または チャンネルID）')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        if (!interaction.guild || !interaction.channel?.isTextBased()) {
            return interaction.editReply('サーバー内のテキストチャンネルで実行してください。');
        }

        const sourceGuild = interaction.guild;
        const sourceChannel = interaction.channel;
        const rawLink = interaction.options.getString('link', true).trim();
        const targetReference = parseReference(rawLink, sourceGuild.id);

        if (!targetReference) {
            return interaction.editReply('リンク先は「サーバーID/チャンネルID」または「チャンネルID」で指定してください。');
        }
        if (targetReference.guildId === sourceGuild.id && targetReference.channelId === sourceChannel.id) {
            return interaction.editReply('転送元と同じチャンネルは指定できません。');
        }

        try {
            const targetGuild = targetReference.guildId === sourceGuild.id
                ? sourceGuild
                : await interaction.client.guilds.fetch(targetReference.guildId).catch(() => null);
            if (!targetGuild) {
                return interaction.editReply('指定されたサーバーにBotが参加していないため、無効なリンク先です。');
            }

            if (targetGuild.id !== sourceGuild.id) {
                const targetMember = await targetGuild.members
                    .fetch(interaction.user.id)
                    .catch(() => null);

                if (!targetMember || !targetMember.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.editReply('リンク先サーバーの管理者権限が必要です。');
                }
            }

            const targetChannel = await targetGuild.channels.fetch(targetReference.channelId).catch(() => null);
            if (!targetChannel || !targetChannel.isTextBased() || typeof targetChannel.createWebhook !== 'function') {
                return interaction.editReply('指定されたチャンネルが存在しないか、Webhookを作成できないため無効です。');
            }

            const sourceData = loadGuildData(sourceGuild.id);
            const targetData = targetGuild.id === sourceGuild.id
                ? sourceData
                : loadGuildData(targetGuild.id);
            const sourceRecord = sourceData[sourceChannel.id] || {};
            const targetRecord = targetData[targetChannel.id] || {};

            const sourcePointsElsewhere = sourceRecord.link && !sameReference(
                sourceRecord.link,
                targetGuild.id,
                targetChannel.id,
                sourceGuild.id
            );
            const targetPointsElsewhere = targetRecord.link && !sameReference(
                targetRecord.link,
                sourceGuild.id,
                sourceChannel.id,
                targetGuild.id
            );

            const overwritingExistingLink = Boolean(sourcePointsElsewhere || targetPointsElsewhere);

            const alreadyLinked = sameReference(
                sourceRecord.link,
                targetGuild.id,
                targetChannel.id,
                sourceGuild.id
            ) || sameReference(
                targetRecord.link,
                sourceGuild.id,
                sourceChannel.id,
                targetGuild.id
            );

            const sourceWebhook = await ensureWebhook(sourceChannel, sourceRecord);
            const targetWebhook = await ensureWebhook(targetChannel, targetRecord);

            const dataByGuild = new Map([
                [sourceGuild.id, sourceData],
                [targetGuild.id, targetData]
            ]);
            removePreviousReverseLink(
                dataByGuild,
                sourceRecord.link,
                sourceGuild.id,
                sourceChannel.id,
                targetGuild.id,
                targetChannel.id
            );
            removePreviousReverseLink(
                dataByGuild,
                targetRecord.link,
                targetGuild.id,
                targetChannel.id,
                sourceGuild.id,
                sourceChannel.id
            );

            sourceData[sourceChannel.id] = {
                ...sourceRecord,
                channel_id: sourceChannel.id,
                link: `${targetGuild.id}/${targetChannel.id}`,
                webhook: sourceWebhook
            };
            targetData[targetChannel.id] = {
                ...targetRecord,
                channel_id: targetChannel.id,
                link: `${sourceGuild.id}/${sourceChannel.id}`,
                webhook: targetWebhook
            };

            for (const [guildId, guildData] of dataByGuild) {
                saveGuildData(guildId, guildData);
            }

            return interaction.editReply([
                overwritingExistingLink
                    ? '既存リンクを上書きして、チャンネルをリンクしました。'
                    : alreadyLinked
                        ? 'このチャンネルペアは登録済みです。Webhook情報:'
                        : 'チャンネルをリンクし、両方のWebhookを登録しました。',
                `転送元 <#${sourceChannel.id}> Webhook: ${formatWebhook(sourceWebhook)}`,
                `リンク先 <#${targetChannel.id}> Webhook: ${formatWebhook(targetWebhook)}`
            ].join('\n'));
        } catch (error) {
            console.error('チャンネルリンク設定に失敗しました:', error);
            return interaction.editReply('チャンネルの確認またはWebhook設定に失敗しました。Botのチャンネル管理権限と設定JSONを確認してください。');
        }
    }
};
