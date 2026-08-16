const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const config = require('../data/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sendmessage')
        .setDescription('メッセージを特定のチャンネルまたは全サーバーに送信します。')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('送信するメッセージ')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('channel_id')
                .setDescription('送信先のチャンネルID（省略可）'))
        .addBooleanOption(option =>
            option.setName('send_all')
                .setDescription('すべてのサーバーに送信（true にすると channel_id は無視）')),

    async execute(interaction) {
        const targetGuildId = '1430524783237529603'; // 草餅鯖
        const logChannelId = '1493959503077445776'; // ログ用チャンネルID

        // ログチャンネル取得（★修正点）
        const logChannel = await interaction.client.channels
            .fetch(logChannelId)
            .catch(() => null);

        // 草餅鯖取得
        const targetGuild = await interaction.client.guilds.fetch(targetGuildId).catch(() => null);
        if (!targetGuild) {
            return interaction.reply({ content: '対象サーバー（草餅）を取得できませんでした。', ephemeral: true });
        }

        // 草餅鯖でのメンバー取得
        const member = await targetGuild.members.fetch(interaction.user.id).catch(() => null);
        if (!member) {
            return interaction.reply({ content: 'あなたは草餅のメンバーではありません。', ephemeral: true });
        }

        // 権限チェック
        const ROLE_ID = '1457983811865546937'; // 許可したいロールID

        const isrole = member.roles.cache.has(ROLE_ID);
     

        const isBotOwner = interaction.user.id === config.ownerId;
        const isOwner = targetGuild.ownerId === interaction.user.id;
        const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);

        if (!isBotOwner && !isOwner && !isAdmin && !isrole) {
            return interaction.reply({
                content: 'このコマンドを実行するには草餅のオーナーまたは管理者権限が必要です。',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const rawMessage = interaction.options.getString('message');
        const message = rawMessage.replace(/\\n/g, '\n');
        const channelId = interaction.options.getString('channel_id');
        const sendAll = interaction.options.getBoolean('send_all') === true;

        // ===== 一斉送信 =====
        if (sendAll) {
            await interaction.editReply({ content: '一斉送信を開始します...' });

            let success = 0, fail = 0;
            const allGuilds = await interaction.client.guilds.fetch();

            for (const [, guildData] of allGuilds) {
                try {
                    const guild = await guildData.fetch();
                    const me = await guild.members.fetchMe(); // ★修正点
                    const channels = await guild.channels.fetch();

                    const textChannel = channels.find(ch =>
                        ch.isTextBased() &&
                        !ch.isThread() &&
                        ch.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages)
                    );

                    if (textChannel) {
                        await textChannel.send(message);
                        success++;
                    } else {
                        fail++;
                    }
                } catch (err) {
                    console.warn(`[送信失敗] ${guildData.id}: ${err.message}`);
                    fail++;
                }

                await new Promise(res => setTimeout(res, 1000));
            }

            if (logChannel?.isTextBased()) {
                await logChannel.send(
                    `ユーザー ${interaction.user.tag} (${interaction.user.id}) が一斉送信を実行しました。\n\n${message}`
                );
            }

            return interaction.editReply({ content: `一斉送信完了: ✅ ${success}件 / ❌ ${fail}件` });
        }

        // ===== 通常送信 =====
        try {
            const channel = channelId
                ? await interaction.client.channels.fetch(channelId)
                : interaction.channel;

            if (!channel || !channel.isTextBased()) {
                return interaction.editReply({
                    content: '指定されたチャンネルが存在しないか、テキストチャンネルではありません。'
                });
            }

            await channel.send(message);

            const embed = new EmbedBuilder()
                .setTitle('メッセージを送信しました')
                .setColor('Green')
                .addFields(
                    { name: 'ユーザー', value: interaction.user.tag, inline: true },
                    { name: '送信先', value: `<#${channel.id}>`, inline: true },
                    { name: '内容', value: message }
                )
                .setTimestamp();

            if (logChannel?.isTextBased()) {
                await logChannel.send({ embeds: [embed] });
            }

            return interaction.editReply({ content: `メッセージを <#${channel.id}> に送信しました。` });

        } catch (error) {
            console.error('送信エラー:', error);
            return interaction.editReply({ content: 'メッセージの送信中にエラーが発生しました。' });
        }
    }
};
