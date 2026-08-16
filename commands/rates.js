const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadEconomy, getCoinName, isCoinEnabled } = require('../systems/economy');
const { getDemandIndex } = require('../demandMemory');

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('rates')
        .setDescription('全サーバーの変動相場レートを表示します。'),

    async execute(interaction) {

        const generateEmbed = () => {
            const eco = loadEconomy();
            const guilds = eco.guilds;

            const entries = Object.entries(guilds)
                .filter(([guildId]) => isCoinEnabled(guildId))
                .map(([guildId, guild]) => {

                    const coinName = getCoinName(guildId);
                    const supply = typeof guild.totalBalance === 'number'
                        ? guild.totalBalance
                        : 1;

                    const demand = getDemandIndex(guildId);

                    const basePrice = 1 / Math.max(supply, 1);
                    const price = basePrice * (1 + (demand / Math.max(supply, 1)) * 0.3);

                    return { guildId, coinName, supply, demand, price };
                });

            if (entries.length === 0) return null;

            const base = entries.find(e => e.guildId === interaction.guildId) || entries[0];

            let description = `基準: **${base.coinName}**\n\n`;

            for (const entry of entries) {
                const rate = (entry.price / base.price).toFixed(6);

                description +=
                    `**${entry.coinName}**\n` +
                    `1 ${entry.coinName} = ${rate} ${base.coinName}\n` +
                    `発行量: ${Math.floor(entry.supply)}\n` +
                    `需要: ${entry.demand*100}%\n\n`;
            }

            // 4096文字制限対策
            if (description.length > 4000) {
                description = description.slice(0, 4000) + "\n...（以下省略）";
            }

            return new EmbedBuilder()
                .setTitle('💱 コインレート一覧')
                .setDescription(description)
                .setColor(0x00AE86)
                .setTimestamp();
        };


        const initialEmbed = generateEmbed();
        if (!initialEmbed) {
            return interaction.reply('有効なコインはまだありません。');
        }

        const message = await interaction.reply({
            embeds: [initialEmbed],
            fetchReply: true
        });

        const intervalId = setInterval(async () => {
            try {
                const updatedEmbed = generateEmbed();
                if (!updatedEmbed) {
                    clearInterval(intervalId);
                    return;
                }
                await message.edit({ embeds: [updatedEmbed] });
            } catch (error) {
                console.error('自動更新エラー:', error);
                clearInterval(intervalId);
            }
        }, 60 * 1000);
    }
};
