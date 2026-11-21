const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const io = require('../systems/io');

const globalPath = path.join(__dirname, '../data/globalchat.json');

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('register-globalchat')
        .setDescription('このチャンネルをグローバルチャットとして登録します')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.channel;
        const guildId = interaction.guild.id;

        let data = {};
        if (fs.existsSync(globalPath)) {
            try {
                data = JSON.parse(fs.readFileSync(globalPath, 'utf-8'));
            } catch (err) {
                console.error('JSON読み込みエラー:', err);
                return await interaction.editReply({ content: '設定ファイルの読み込み中にエラーが発生しました。' });
            }
        }

        try {
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

            io.writeJsonSync(globalPath, data);

            await interaction.editReply({ content: `このチャンネル (<#${channel.id}>) をグローバルチャットとして登録しました。` });
        } catch (err) {
            console.error('JSON書き込みエラー:', err);
            await interaction.editReply({ content: '設定ファイルの保存中にエラーが発生しました。' });
        }
    },
};
