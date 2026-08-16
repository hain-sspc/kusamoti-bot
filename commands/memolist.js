const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const Path = path.join(__dirname, '..', 'data', 'memo.json');

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('memolist') // 表示用に名前を変更
        .setDescription('自分のメモ一覧を表示します'),
    async execute(interaction) {
        const userId = interaction.user.id;

        let phraseData = [];
        if (fs.existsSync(Path)) {
            const raw = fs.readFileSync(Path, 'utf-8');
            phraseData = JSON.parse(raw);
        }

        // ユーザーのメモだけ抽出
        const userMemos = phraseData.filter(entry => entry.userId === userId);

        if (userMemos.length === 0) {
            return interaction.reply({
                content: 'メモはまだありません。',
                flags: 1 << 6, // ephemeral:true
            });
        }

        // メモ一覧を文字列に整形（最大2000文字に注意）
        const memoList = userMemos.map((entry, i) => `${i + 1}. ${entry.message}`).join('\n');
        const { EmbedBuilder } = require('discord.js');

        const embed = new EmbedBuilder()
            .setColor(0x00ff99)
            .setTitle('メモリスト')
            .addFields([
                { name: 'ユーザー', value: interaction.user.tag, inline: true },
                { name: 'メモ', value: memoList, inline: false }

            ]);

            
        await interaction.reply({ embeds: [embed] })
           // content: `あなたのメモ一覧:\n${memoList}`,
            //flags: 1 << 6, // ephemeral:true
        //});
    }
};
