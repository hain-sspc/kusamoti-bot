const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');

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
        // 3秒ルール対策（応答期限防止）
        await interaction.deferReply({ ephemeral: true });

        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return await interaction.editReply({
                content: '❌ このコマンドは管理者のみ使用できます。'
            });
        }

        const message = interaction.options.getString('message');
        const channelId = interaction.options.getString('channel_id');
        const sendAll = interaction.options.getBoolean('send_all');

        // 一斉送信モード
        if (sendAll) {
            // 遅延を避けるため即時返信 → 非同期処理開始
            interaction.editReply({ content: '📤 一斉送信を開始します...' });

            let success = 0, fail = 0;
            for (const [_, guild] of interaction.client.guilds.cache) {
                try {
                    const channels = await guild.channels.fetch();
                    const textChannel = channels.find(ch =>
                        ch.isTextBased() &&
                        ch.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.SendMessages)
                    );

                    if (textChannel) {
                        await textChannel.send(message);
                        success++;
                    } else {
                        fail++;
                    }
                } catch (e) {
                    console.warn(`[送信失敗] ${guild.name}:`, e.message);
                    fail++;
                }
            }

            return await interaction.followUp({
                content: `📬 一斉送信完了：✅ ${success} 件、❌ ${fail} 件`,
                ephemeral: true
            });
        }

        // 個別チャンネルモード
        if (!channelId) {
            return await interaction.editReply({
                content: '❌ チャンネルIDが指定されていません。channel_id を指定するか send_all:true を使ってください。'
            });
        }

        try {
            const channel = await interaction.client.channels.fetch(channelId);

            if (!channel || !channel.isTextBased()) {
                return await interaction.editReply({
                    content: '❌ 指定されたチャンネルが存在しないか、テキストチャンネルではありません。'
                });
            }

            await channel.send(message);
            return await interaction.editReply({
                content: `✅ <#${channelId}> にメッセージを送信しました。`
            });

        } catch (error) {
            console.error('送信エラー:', error);
            return await interaction.editReply({
                content: '❌ メッセージの送信中にエラーが発生しました。'
            });
        }
    }
};
