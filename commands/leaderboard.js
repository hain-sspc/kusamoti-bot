const {SlashCommandBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,ComponentType} = require('discord.js');
const fs = require('fs');
const { loadEconomy, getCoinName, getGuildData, getUserEc, getBalance, bankbalance, serverbankbalance } = require('../systems/economy');//変更点：関数を追加

const economyPath = "./data/economy.json";
const ENTRIES_PER_PAGE = 10;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('所持金ランキングを表示します'),
        
    async execute(interaction) {
        try {
            await interaction.deferReply();
            const replyMessage = await interaction.fetchReply();

            const guildId = interaction.guildId;
            const eco = loadEconomy();
            const guildData = getGuildData(eco, guildId);
            const bankData = serverbankbalance(eco, guildId) || {};

            if (!guildData?.users) {
                return interaction.editReply('このサーバーには経済データがありません。/step_coinsで設定してください');
            }

            const coinName = getCoinName(guildId) || 'コイン';

            // ✅ ユーザーごとに「所持金 + 銀行」を合算
            const sorted = Object.entries(guildData.users)
                .filter(([_, data]) => data && typeof data.balance === 'number')
                .map(([userId, data]) => {
                    const bankAmount = bankData[userId]?.deposit || 0;
                    return {
                        userId,
                        total: data.balance + bankAmount
                    };
                })
                .sort((a, b) => b.total - a.total);

            const generateEmbed = async (page) => {
                const start = page * ENTRIES_PER_PAGE;
                const paginated = sorted.slice(start, start + ENTRIES_PER_PAGE);

                let description = '';

                for (let i = 0; i < paginated.length; i++) {
                    const { userId, total } = paginated[i];
                    const user = await interaction.client.users.fetch(userId).catch(() => null);
                    const name = user ? user.tag : '不明なユーザー';

                    description += `**${start + i + 1}. ${name}** - 所持金:${total} ${coinName}\n`;
                }

                return new EmbedBuilder()
                    .setTitle('所持金ランキング')
                    .setDescription(description || 'ランキングデータがありません。')
                    .setColor(0xFFD700);
            };

            let currentPage = 0;
            const totalPages = Math.ceil(sorted.length / ENTRIES_PER_PAGE);

            const prevBtn = new ButtonBuilder()
                .setCustomId('prev')
                .setLabel('前へ')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true);

            const nextBtn = new ButtonBuilder()
                .setCustomId('next')
                .setLabel('次へ')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(totalPages <= 1);

            const row = new ActionRowBuilder().addComponents(prevBtn, nextBtn);

            await interaction.editReply({
                embeds: [await generateEmbed(currentPage)],
                components: totalPages > 1 ? [row] : []
            });

            if (totalPages <= 1) return;

            const collector = replyMessage.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 60000
            });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: 'このボタンはあなたのものじゃないんですから', ephemeral: true });
                }

                if (i.customId === 'next') currentPage++;
                else if (i.customId === 'prev') currentPage--;

                prevBtn.setDisabled(currentPage === 0);
                nextBtn.setDisabled(currentPage === totalPages - 1);

                await i.update({
                    embeds: [await generateEmbed(currentPage)],
                    components: [row]
                });
            });

            collector.on('end', async () => {
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        prevBtn.setDisabled(true),
                        nextBtn.setDisabled(true)
                    );

                try {
                    await replyMessage.edit({ components: [disabledRow] });
                } catch (error) {
                    if (error.code === 10008) {
                        console.log("メッセージは削除されているため編集できません");
                    } else {
                        console.error(error);
                    }
                }
            });

        } catch (error) {
            console.error(error);
            const fallback = interaction.deferred
                ? interaction.followUp.bind(interaction)
                : interaction.reply.bind(interaction);

            await fallback({ content: 'エラーが発生しました。', ephemeral: true });
        }
    }

};
