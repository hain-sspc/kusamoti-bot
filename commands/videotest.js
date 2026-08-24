const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const path = require("path");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("videotest")
        .setDescription("アクティブメンバーの歴代ランキング動画を生成します"),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            // 後で実際の動画生成処理をここから呼び出す
            const { Ranking} = require("../systems/Ranking");

            const outputPath = await Ranking({
                guildId: interaction.guild.id
            });

            const attachment = new AttachmentBuilder(outputPath);

            await interaction.editReply({
                content: "生成完了",
                files: [attachment]
            });

        } catch (error) {
            console.error("動画生成エラー:", error);

            await interaction.editReply({
                content: "動画の生成中にエラーが発生しました。"
            });
        }
    }
};