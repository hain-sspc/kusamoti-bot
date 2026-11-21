const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadGuildData } = require("../messageLogger");
const { createMonthlyRankingVideo } = require("../systems/monthlyMessageVideo");

function isAttachmentTooLarge(error) {
    return error.code === 40005 ||
        error.rawError?.code === 40005 ||
        error.status === 413;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("monthlyvideo")
        .setDescription("過去30日間のメッセージランキング推移を動画にします"),

    async execute(interaction) {
        await interaction.deferReply();

        const outputDirectory = fs.mkdtempSync(
            path.join(os.tmpdir(), `kusamoti-monthly-${interaction.guild.id}-`)
        );

        try {
            const guildData = loadGuildData(interaction.guild.id);
            let lastProgress = -1;
            let progressUpdatesEnabled = true;
            const outputPath = await createMonthlyRankingVideo({
                logs: guildData.logs,
                guild: interaction.guild,
                client: interaction.client,
                output: path.join(outputDirectory, "monthly-ranking.mp4"),
                onProgress: async (completedFrames, totalFrames) => {
                    const progress = Math.floor(
                        (completedFrames / totalFrames) * 100
                    );
                    if (progress === 100 || progress >= lastProgress + 10) {
                        lastProgress = progress;
                        if (!progressUpdatesEnabled) return;
                        try {
                            await interaction.editReply(
                                `動画を生成中... ${progress}%`
                            );
                        } catch (error) {
                            progressUpdatesEnabled = false;
                            console.warn(
                                "動画生成の進捗通知に失敗しました。生成は継続します:",
                                error.message
                            );
                        }
                    }
                }
            });

            try {
                await interaction.editReply({
                    content: "過去30日間のランキング推移動画です。",
                    files: [new AttachmentBuilder(outputPath)]
                });
            } catch (error) {
                if (!isAttachmentTooLarge(error)) throw error;

                const saveDirectory = path.join(
                    __dirname,
                    "..",
                    "data",
                    "monthly-videos"
                );
                const savedPath = path.join(
                    saveDirectory,
                    `${interaction.guild.id}-${Date.now()}.mp4`
                );
                fs.mkdirSync(saveDirectory, { recursive: true });
                fs.copyFileSync(outputPath, savedPath);
                console.warn(
                    `動画が添付サイズ上限を超えたため保存しました: ${savedPath}`
                );
                await interaction.editReply({
                    content: `動画が添付サイズ上限を超えたため、サーバーに保存しました。\n保存先: ${savedPath}`,
                    files: []
                });
            }
        } catch (error) {
            console.error("30日間ローリングランキング動画の生成または送信失敗:", error);
            try {
                await interaction.editReply({
                    content: error.message === "メッセージデータがありません"
                        ? error.message
                        : "動画の生成または送信に失敗しました。ffmpeg の状態とログを確認してください。"
                });
            } catch (replyError) {
                console.error("動画エラーの返信にも失敗しました:", replyError);
            }
        } finally {
            fs.rmSync(outputDirectory, { recursive: true, force: true });
        }
    }
};
