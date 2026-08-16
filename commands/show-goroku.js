const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const gorokuPath = path.join(__dirname, '..', 'data', 'phraseResponses.json');

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('show-goroku')
        .setDescription('登録されている草餅語録を一覧表示します。'),

    async execute(interaction) {
        try {
            if (!fs.existsSync(gorokuPath)) {
                return await interaction.reply({ content: '⚠ 語録ファイルが存在しません。', ephemeral: true });
            }

            const raw = fs.readFileSync(gorokuPath, 'utf-8');
            const phraseData = JSON.parse(raw);

            if (phraseData.length === 0) {
                return await interaction.reply({ content: '語録がまだ登録されていません。', ephemeral: true });
            }

            // Embed を25件ごとに分割
            const chunks = [];
            for (let i = 0; i < phraseData.length; i += 25) {
                const slice = phraseData.slice(i, i + 25);
                const embed = new EmbedBuilder()
                    .setTitle('草餅語録一覧')
                    .setColor('#00AA00')
                    .setFooter({ text: `ページ ${Math.floor(i / 25) + 1} / ${Math.ceil(phraseData.length / 25)}` })
                    .setTimestamp();

                slice.forEach((item, index) => {
                    embed.addFields({
                        name: `#${i + index + 1} キーワード: ${item.keywords.join(', ')}`,
                        value: item.response.length > 1024 ? item.response.slice(0, 1021) + '...' : item.response
                    });
                });

                chunks.push(embed);
            }

            // 1件目だけ reply、それ以降は followUp
            await interaction.reply({ embeds: [chunks[0]] });

            for (let i = 1; i < chunks.length; i++) {
                await interaction.followUp({ embeds: [chunks[i]], ephemeral: false });
            }

        } catch (err) {
            console.error(err);
            await interaction.reply({ content: '⚠ 語録の読み込み中にエラーが発生しました。', ephemeral: true });
        }
    }
};
