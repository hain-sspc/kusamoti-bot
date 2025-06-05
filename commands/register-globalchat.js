const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

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

        // Webhook 作成 or 取得
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
};
