const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("videotest")
        .setDescription("アクティブメンバーの歴代ランキング動画を生成します"),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const { createRankingVideo} = require("../systems/videoranking");
            let lastProgress = -1;

            const outputPath = await createRankingVideo({
                 guildId: interaction.guild.id,
                 guild: interaction.guild,
                 client: interaction.client,
                 onProgress: async (completedFrames, totalFrames) => {
                     const progress = Math.floor(
                         (completedFrames / totalFrames) * 100
                     );

                     if (progress >= 100 || progress >= lastProgress + 5) {
                         lastProgress = progress;
                         await interaction.editReply(
                             `動画生成中... ${progress}%`
                         );
                     }
                 }
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