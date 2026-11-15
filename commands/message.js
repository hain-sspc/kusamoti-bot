const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    EmbedBuilder
} = require('discord.js');
//const fs = require('fs');
//const path = require('path');
const { loadGuildData } = require('../messageLogger');
//const DATA_PATH = path.join(__dirname, '../data/messagecount');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('message')
        .setDescription('過去24時間のメッセージ数ランキングを表示します')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('集計モード')
                .addChoices(
                    { name: '1時間', value: 'sshort' },
                    { name: '24時間', value: 'short' },
                    { name: '72時間', value: 'long' },
                    { name: '1か月', value: 'month' },
                    { name: '全て', value: 'all' }
                )
        ),

    async execute(interaction) {
        await interaction.deferReply();
        const replyMessage = await interaction.fetchReply();
        const mode = interaction.options.getString('mode') || 'short';
        const entriesPerPage = 10;
        const modes = {
            sshort: { hours: 1, label: "1時間" },
            short: { hours: 24, label: "24時間" },
            long: { hours: 72, label: "72時間" },
            month: { hours: 720, label: "1か月" },
            all: { hours: null, label: "全期間" }
        };

        const selected = modes[mode] || modes.short;

        const since = selected.hours
            ? Date.now() - (selected.hours * 60 * 60 * 1000)
            : 0;

        const modalinterchange = selected.label;

        const guildId = interaction.guild.id;
   
    

        const raw = loadGuildData(guildId);
        const guildData = raw?.logs;

        if (!guildData) {
            return interaction.editReply('このサーバーのデータはありません。');
        }

        const userCounts = new Map();
        let totalMessages = 0;

        for (const [timeKey, data] of Object.entries(guildData)) {

            
           // if (!timeKey.includes('T')) continue;

            const time = new Date(timeKey + ":00Z").getTime();
            if (isNaN(time) || time < since) continue;

            totalMessages += data.total;

            for (const [userId, count] of Object.entries(data.users)) {
                userCounts.set(
                    userId,
                    (userCounts.get(userId) || 0) + count
                );
            }
        }

        if (userCounts.size === 0) {
            return interaction.editReply(`過去${modalinterchange}のメッセージはありません。`);
        }

        const ranking = [...userCounts.entries()]
            .sort((a, b) => b[1] - a[1]);
        ranking.forEach(([userId, count]) => console.log(`${userId}:${count}`));
        const totalPages = Math.ceil(ranking.length / entriesPerPage);

        const generateEmbed = async page => {
            const start = page * entriesPerPage;
            const pageRanking = ranking.slice(start, start + entriesPerPage);
            const description = await Promise.all(
                pageRanking.map(async ([userId, count], i) => {
                    const user = await interaction.client.users
                        .fetch(userId)
                        .catch(() => null);
                    const name = user ? user.username : `Unknown (${userId})`;
                    return `**${start + i + 1}位** ${name} — **${count}**`;
                })
            );

            return new EmbedBuilder()
                .setTitle(`メッセージランキング（過去${modalinterchange}）`)
                .setDescription(description.join('\n'))
                .addFields({
                    name: 'サーバー合計',
                    value: `**${totalMessages}**`,
                    inline: false
                })
                .setColor(0x00bfff)
                .setFooter({
                    text: `集計開始: ${new Date(since).toLocaleString('ja-JP')}` +
                        (totalPages > 1 ? ` | ページ ${page + 1}/${totalPages}` : '')
                })
                .setTimestamp();
        };

        if (totalPages <= 1) {
            return interaction.editReply({ embeds: [await generateEmbed(0)] });
        }

        let currentPage = 0;
        const previousButton = new ButtonBuilder()
            .setCustomId('message_previous')
            .setLabel('前へ')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true);
        const nextButton = new ButtonBuilder()
            .setCustomId('message_next')
            .setLabel('次へ')
            .setStyle(ButtonStyle.Primary);
        const row = new ActionRowBuilder().addComponents(previousButton, nextButton);

        await interaction.editReply({
            embeds: [await generateEmbed(currentPage)],
            components: [row]
        });

        const collector = replyMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000
        });

        collector.on('collect', async buttonInteraction => {
            if (buttonInteraction.user.id !== interaction.user.id) {
                return buttonInteraction.reply({
                    content: 'このボタンはコマンドを実行した人だけが使えます。',
                    ephemeral: true
                });
            }

            if (buttonInteraction.customId === 'message_next') currentPage++;
            else if (buttonInteraction.customId === 'message_previous') currentPage--;

            previousButton.setDisabled(currentPage === 0);
            nextButton.setDisabled(currentPage === totalPages - 1);

            await buttonInteraction.update({
                embeds: [await generateEmbed(currentPage)],
                components: [row]
            });
        });

        collector.on('end', async () => {
            previousButton.setDisabled(true);
            nextButton.setDisabled(true);
            try {
                await replyMessage.edit({ components: [row] });
            } catch (error) {
                if (error.code === 10008) {
                    console.log('メッセージは削除されているため編集できません');
                } else {
                    console.error(error);
                }
            }
        });
    }
};
