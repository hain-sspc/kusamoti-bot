const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ai = require('../systems/ai');

function formatAnalysis(analysis) {
    const lines = [
        `入力: ${analysis.text}`,
        `学習文: ${analysis.sentenceCount}件 (完全一致: ${analysis.exactSentenceCount}件)`,
        `会話ペア: ${analysis.conversationPairCount}件`,
        '',
        '形態素 (基本形 / 品詞 / 出現数 / 感情平均):',
        ...analysis.tokens.map(token =>
            `- ${token.base} / ${token.pos} / ${token.frequency} / ` +
            `${token.emotion === null ? '未学習' : token.emotion.toFixed(3)} (${token.emotionCount})`
        ),
        '',
        '隣接語・品詞の学習回数:',
        ...(analysis.transitions.length > 0
            ? analysis.transitions.map(transition =>
                `- ${transition.from} -> ${transition.to}: ` +
                `語=${transition.count}, 品詞(${transition.posFrom} -> ${transition.posTo})=${transition.posCount}`
            )
            : ['- 解析可能な隣接語なし']),
        '',
        '類似する会話ペア (上位5件):',
        ...(analysis.similarPairs.length > 0
            ? analysis.similarPairs.map(pair =>
                `- 類似度=${pair.score.toFixed(3)} 入力=${pair.input} ` +
                `応答=${pair.replies.slice(0, 3).join(' | ')}`
            )
            : ['- 該当なし'])
    ];

    return lines.join('\n');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ai-analysis')
        .setDescription('AI学習データから指定文の解析ログを出力します')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('解析する文章')
                .setRequired(true)
                .setMaxLength(500)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.editReply('このコマンドは管理者のみ実行できます。');
        }

        if (!ai.isReady()) {
            return interaction.editReply('AIの初期化が完了していません。しばらくしてから再実行してください。');
        }

        const text = interaction.options.getString('text', true).trim();
        if (!text) {
            return interaction.editReply('解析する文章を入力してください。');
        }

        const report = formatAnalysis(ai.analyzeText(text));
        console.log(`[AI ANALYSIS] requestedBy=${interaction.user.id}\n${report}`);

        const maxReportLength = 1800;
        const displayedReport = report.length > maxReportLength
            ? `${report.slice(0, maxReportLength)}\n… (表示を省略しました。完全な内容はBotログを確認してください)`
            : report;

        await interaction.editReply({
            content: `\`\`\`\n${displayedReport.replace(/```/g, "'''")}\n\`\`\``,
            allowedMentions: { parse: [] }
        });
    }
};
