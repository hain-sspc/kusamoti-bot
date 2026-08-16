const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('targetsubs')
        .setDescription('YouTube登録者の増加率と目標到達予測を計算します')
        .addStringOption(option =>
            option.setName('startdate')
                .setDescription('チャンネル開始日 (例: 2025-06-24)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('currentsubs')
                .setDescription('現在の登録者数')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('startsubs')
                .setDescription('スタート時の登録者数')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('targetsubs')
                .setDescription('目標登録者数')
                .setRequired(true)),

    async execute(interaction) {
        try {
            const startDateStr = interaction.options.getString('startdate');
            const currentSubs = Number(interaction.options.getString('currentsubs'));
            const startSubs = Number(interaction.options.getString('startsubs'));
            const targetSubs = Number(interaction.options.getString('targetsubs'));
            const today = new Date();

            const startDate = new Date(startDateStr);
            if (isNaN(startDate)) {
                return interaction.reply('開始日の形式が不正です。例: 2025-06-24');
            }
            if ([currentSubs, startSubs, targetSubs].some(n => isNaN(n) || n < 0)) {
                return interaction.reply('登録者数は0以上の数字で入力してください。');
            }
            if (currentSubs < startSubs) {
                return interaction.reply('現在の登録者数はスタート時より少なくできません。');
            }
            if (targetSubs <= currentSubs) {
                return interaction.reply('目標登録者数は現在の登録者数より大きく設定してください。');
            }

            const diffTime = today - startDate;
            const diffDays = diffTime / (1000 * 60 * 60 * 24);

            if (diffDays <= 0) {
                return interaction.reply('開始日は今日以前の日付を指定してください。');
            }

            const growthRate = (currentSubs - startSubs) / diffDays;
            if (growthRate <= 0) {
                return interaction.reply('増加率が0以下のため、目標到達は予測できません。');
            }

            const remaining = targetSubs - currentSubs;
            const daysNeeded = remaining / growthRate;

            const targetDate = new Date(today);
            targetDate.setDate(today.getDate() + Math.ceil(daysNeeded));

            
            const embed = new EmbedBuilder()
                .setTitle('解析結果')
                .setColor('Green')
                .addFields(
                    {  name: '1日あたりの平均増加数', value: `${growthRate.toFixed(2)}人/日\n`, inline: true },
                    { name: '目標登録者数までに必要な日数', value: `${daysNeeded.toFixed(1)}日\n`, inline: true },
                    { name: '予測到達日', value: `${targetDate.toLocaleDateString()}`, inline: false }
                )
                .setTimestamp();
            
                return interaction.reply({ embeds: [embed] });
            

        } catch (error) {
            console.error(error);
            return interaction.reply('エラーが発生しました。入力を確認してください。');
        }
    },
};
