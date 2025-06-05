const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const globalPath = path.join(__dirname, '../data/globalchat.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('register-globalchat')
        .setDescription('このサーバーのグローバルチャットチャンネルを登録します')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('登録するテキストチャンネル')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');
        const guildId = interaction.guild.id;

        let data = {};
        if (fs.existsSync(globalPath)) {
            try {
                data = JSON.parse(fs.readFileSync(globalPath, 'utf-8'));
            } catch (err) {
                console.error('JSON読み込みエラー:', err);
                return interaction.reply({ content: '設定ファイルの読み込み中にエラーが発生しました。', ephemeral: true });
            }
        }

        // Webhook 作成
        const webhooks = await channel.fetchWebhooks();
        let webhook = webhooks.find(wh => wh.name === 'GlobalChat');
        if (!webhook) {
            webhook = await channel.createWebhook({ name: 'GlobalChat' });
        }

        data[guildId] = {
            webhook_url: webhook.url,
            channel_id: channel.id
        };

        try {
            fs.writeFileSync(globalPath, JSON.stringify(data, null, 2), 'utf-8');
            await interaction.reply({ content: `✅ チャンネル <#${channel.id}> をグローバルチャットとして登録しました。`, ephemeral: true });
        } catch (err) {
            console.error('JSON書き込みエラー:', err);
            await interaction.reply({ content: '設定ファイルの保存中にエラーが発生しました。', ephemeral: true });
        }
    },

    // メッセージを受信した際の処理
    async handleGlobalMessage(message) {
        if (message.author.bot) return;
        if (!fs.existsSync(globalPath)) return;

        const data = JSON.parse(fs.readFileSync(globalPath, 'utf-8'));

       
        const thisEntry = Object.entries(data).find(([_, entry]) => entry.channel_id === message.channel.id);
        if (!thisEntry) return;

        const embed = {
            title: `🌐 ${message.author.tag}（${message.guild.name}）`,
            description: message.content || "(本文なし)",
            color: 0x00ccff,
            timestamp: new Date().toISOString(),
            footer: {
                text: `ID: ${message.author.id}`
            }
        };

        if (message.attachments.size > 0) {
            embed.image = { url: message.attachments.first().url };
        }

        
        for (const [guildId, entry] of Object.entries(data)) {
            if (entry.channel_id === message.channel.id) continue;

            try {
                await axios.post(entry.webhook_url, {
                    username: `${message.author.username} @ ${message.guild.name}`,
                    avatar_url: message.author.displayAvatarURL({ format: 'png' }),
                    embeds: [embed]
                });
            } catch (err) {
                console.error(`グローバル送信失敗 (${guildId}):`, err.message);
            }
        }
    }
};
