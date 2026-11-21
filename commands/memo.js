const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const io = require('../systems/io');

const Path = path.join(__dirname, '..', 'data', 'memo.json'); // ✅ ファイルパスを変数に定義

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('memo')
        .setDescription('メモをします')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('メッセージ')
                .setRequired(true)
        ),

    async execute(interaction) {
        const message = interaction.options.getString("message");
        const userId = interaction.user.id;
        let phraseData = []; // 最初に配列として初期化

        // すでにメモファイルがある場合は読み込む
        if (fs.existsSync(Path)) {
            const raw = fs.readFileSync(Path, 'utf-8');
            phraseData = JSON.parse(raw);
            console.log(`読み込み成功: ${phraseData.length}件`);
        }

        // メモを追加
        phraseData.push({ userId,message });

        // JSONに保存
        io.writeJsonSync(Path, phraseData);
        console.log('保存成功: メモを追加しました。');

        await interaction.reply({
            content: 'メモを追加しました。',
            flags: 1 << 6,
        });
    }
};
