const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType } = require('discord.js');

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('quiz')
        .setDescription('クイズを出題します')
        .addStringOption(option =>
            option.setName('question').setDescription('クイズの問題文').setRequired(true))
        .addStringOption(option =>
            option.setName('option1').setDescription('選択肢1').setRequired(true))
        .addStringOption(option =>
            option.setName('option2').setDescription('選択肢2').setRequired(true))
        .addStringOption(option =>
            option.setName('option3').setDescription('選択肢3').setRequired(true))
        .addIntegerOption(option =>
            option.setName('answer').setDescription('正解の番号（1〜3）').setRequired(true)),

    async execute(interaction) {
        const question = interaction.options.getString('question');
        const options = [
            interaction.options.getString('option1'),
            interaction.options.getString('option2'),
            interaction.options.getString('option3')
        ];
        const correctIndex = interaction.options.getInteger('answer') - 1;

        if (correctIndex < 0 || correctIndex >= options.length) {
            return interaction.reply({ content: '正解番号は 1〜3 で指定してください。', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('クイズ')
            .setDescription(question)
            .setColor(0x00bfff)
            .setFooter({ text: 'ボタンで答えを選んでください（10分以内）' });

        const row = new ActionRowBuilder().addComponents(
            options.map((opt, i) =>
                new ButtonBuilder()
                    .setCustomId(`quiz_answer_${i}`)
                    .setLabel(opt)
                    .setStyle(ButtonStyle.Primary)
            )
        );

        const quizMessage = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

        const filter = i => i.customId.startsWith('quiz_answer_') && !i.user.bot;
        const collector = quizMessage.createMessageComponentCollector({
            filter,
            componentType: ComponentType.Button,
            time: 10 * 60 * 1000 // 🔸10分（600000ms）
        });

        const answeredUsers = new Set();

        collector.on('collect', async i => {
            if (answeredUsers.has(i.user.id)) {
                await i.reply({ content: 'すでに回答しています。', ephemeral: true });
                return;
            }

            answeredUsers.add(i.user.id);
            const chosen = parseInt(i.customId.split('_')[2]);

            if (chosen === correctIndex) {
                await i.reply(`🎉 正解！おめでとう ${i.user.username} さん！`);
            } else {
                await i.reply(`❌ 残念、不正解！ ${i.user.username} さん`);
            }
        });

        collector.on('end', async collected => {
            console.log(`[QUIZ] クイズ終了（回答者数: ${collected.size}）`);

            // ボタン無効化
            const disabledRow = new ActionRowBuilder().addComponents(
                row.components.map(button => ButtonBuilder.from(button).setDisabled(true))
            );

            await quizMessage.edit({
                components: [disabledRow]
            });

            await interaction.followUp({ content: `クイズは終了しました！`, ephemeral: false });
        });
    }
};
