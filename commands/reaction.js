const { SlashCommandBuilder, ChannelType } = require("discord.js");

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName("reaction")
        .setDescription("指定したチャンネルのメッセージにリアクションを追加します")
        .addChannelOption(option =>
            option.setName("channel")
                .setDescription("メッセージのあるチャンネル")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("message_id")
                .setDescription("リアクションを付けたいメッセージID")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("emoji")
                .setDescription("付けるリアクション（例：👍 または <:name:id>）")
                .setRequired(true)
        ),

    async execute(interaction) {

        const channel = interaction.options.getChannel("channel");
        const messageId = interaction.options.getString("message_id");
        const emoji = interaction.options.getString("emoji");

        try {
            // 指定チャンネルからメッセージ取得
            const targetMsg = await channel.messages.fetch(messageId);

            if (!targetMsg) {
                return interaction.reply({ content: "メッセージが見つかりませんでした。", ephemeral: true });
            }

            // リアクション追加
            await targetMsg.react(emoji);

            return interaction.reply({
                content: ` ${channel} に ${emoji} を付けた！`,
                ephemeral: true
            });

        } catch (err) {
            console.error("Reaction Error:", err);
            return interaction.reply({
                content: "エラー：メッセージが取得できないか、絵文字が無効です。",
                ephemeral: true
            });
        }
    }
};
