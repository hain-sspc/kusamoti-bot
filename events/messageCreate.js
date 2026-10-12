const { Events, EmbedBuilder, WebhookClient } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { minuteBuffer } = require('../messageLogger');
const ai = require('../systems/ai');
const AI_CHANNEL_ID = require("../data/config.json").AI_CHANNEL_ID;
const webhookClients = new Map();

function getWebhookUrl(channelData) {
    return channelData?.webhook_url ||
        channelData?.webhookUrl ||
        channelData?.webhook ||
        null;
}

function parseLinkedChannel(link, defaultGuildId, linkData = null) {
    if (typeof link === 'string') {
        const parts = link.split('/').filter(Boolean);
        if (parts.length >= 2) {
            return {
                guildId: parts[0],
                channelId: parts[1],
                data: linkData
            };
        }
        return {
            guildId: defaultGuildId,
            channelId: parts[0],
            data: linkData
        };
    }

    if (link && typeof link === 'object') {
        const channelReference = link.link || link.channel || link.channel_id || link.channelId || link.id;
        const linkedGuildId = link.guild_id || link.guildId || defaultGuildId;
        const parsed = parseLinkedChannel(channelReference, linkedGuildId, link);
        return parsed;
    }

    return null;
}

function getLinkedChannels(links, defaultGuildId) {
    if (typeof links === 'string') {
        const linkedChannel = parseLinkedChannel(links, defaultGuildId);
        return linkedChannel ? [linkedChannel] : [];
    }

    if (Array.isArray(links)) {
        return links
            .map(link => parseLinkedChannel(link, defaultGuildId))
            .filter(Boolean);
    }

    if (links && typeof links === 'object') {
        const directReference = links.link || links.channel || links.channel_id || links.channelId || links.id;
        if (directReference) {
            const linkedChannel = parseLinkedChannel(links, defaultGuildId);
            return linkedChannel ? [linkedChannel] : [];
        }
        return Object.entries(links)
            .map(([channelReference, linkData]) =>
                parseLinkedChannel(linkData?.link || channelReference, defaultGuildId, linkData)
            )
            .filter(Boolean);
    }

    return [];
}


async function aimessage(message){
    try {
        if (message.author.bot) return;
        if (!message.content) return;
        if (!ai.isReady()) return;

        const input = ai.cleanInput(message.content);
        if (!input) return;

        await ai.learn(input);

        let reply = null;

        if (message.channel.id === AI_CHANNEL_ID) {
            reply = ai.generateSmart(input);

            if (reply && reply.trim()) {
                await message.reply(reply);
                await ai.learnPair(input, reply);
            }

            return;
        }

      

    } catch (err) {
        console.error(err);
    }
    }

module.exports = {
    name: Events.MessageCreate,

    async execute(message, client) {

        if (message.author.bot) return;

        void get_message().catch(console.error);
        messege_count_loger();

        function messege_count_loger(){
          const guildId = message.guild?.id;
          if (!guildId) return;

          const userId = message.author.id;

          minuteBuffer[guildId] ??= {
             total: 0,
             users: {}
            };

          minuteBuffer[guildId].users[userId] =
             (minuteBuffer[guildId].users[userId] || 0) + 1;

              minuteBuffer[guildId].total++;

        }
        
    async function get_message(){
        const guildId = message.guild?.id;
        if (!guildId || !/^\d+$/.test(guildId)) return;

        const linksPath = path.join(
            __dirname,
            '..',
            'data',
            'channel_links',
            `${guildId}.json`
        );

        if (!fs.existsSync(linksPath)) return;

        let guildChannelData;
        try {
            guildChannelData = JSON.parse(fs.readFileSync(linksPath, 'utf8'));
        } catch (error) {
            console.error(`チャンネルリンク設定の読み込みに失敗しました (${guildId}):`, error);
            return;
        }

        const sourceChannelData = guildChannelData?.[message.channel.id];
        if (!sourceChannelData) return;

        const links = sourceChannelData.links ?? sourceChannelData.link;
        const linkedChannels = getLinkedChannels(links, guildId);
        let webhookUrl = null;

        for (const linkedChannel of linkedChannels) {
            const linkedGuildId = linkedChannel.guildId;
            const linkedChannelId = linkedChannel.channelId;
            if (!/^\d+$/.test(linkedGuildId || '') || !/^\d+$/.test(linkedChannelId || '')) {
                continue;
            }

            let linkedGuildData = guildChannelData;
            if (linkedGuildId !== guildId) {
                const linkedGuildPath = path.join(
                    __dirname,
                    '..',
                    'data',
                    'channel_links',
                    `${linkedGuildId}.json`
                );
                if (!fs.existsSync(linkedGuildPath)) continue;

                try {
                    linkedGuildData = JSON.parse(fs.readFileSync(linkedGuildPath, 'utf8'));
                } catch (error) {
                    console.error(`リンク先サーバーの設定読み込みに失敗しました (${linkedGuildId}):`, error);
                    continue;
                }
            }

            const linkedChannelData = linkedGuildData?.[linkedChannelId];
            webhookUrl = getWebhookUrl(linkedChannelData) || getWebhookUrl(linkedChannel.data);
            if (webhookUrl) break;
        }

        // 旧形式ではWebhookがメッセージ元チャンネルの設定に保存されています。
        webhookUrl ||= getWebhookUrl(sourceChannelData);
        if (!webhookUrl) {
            console.warn(`リンク先のWebhookが設定されていません: ${guildId}/${message.channel.id}`);
            return;
        }

        const embed = new EmbedBuilder()
            .setAuthor({
                name: `${message.author.username} (${message.author.id})`,
                iconURL: message.author.displayAvatarURL()
            })
            .setDescription(message.content || '*（メッセージ本文なし）*')
            
            .setTimestamp(message.createdAt);

        let webhookClient = webhookClients.get(webhookUrl);
        if (!webhookClient) {
            webhookClient = new WebhookClient({ url: webhookUrl });
            webhookClients.set(webhookUrl, webhookClient);
        }

       await webhookClient.send({
    　　　username: message.channel.name,
    　　　avatarURL: message.guild.iconURL({ extension: 'png', size: 256 }),
   　　　　embeds: [embed]
　　　　　});
    }

    await aimessage(message);
    }
};