const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadEconomy, getCoinName, isCoinEnabled } = require('../economy');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rates')
        .setDescription('全サーバーのコイン名、サーバーID、レートを表示します。'),

    async execute(interaction) {
        const generateEmbed = () => {
            const eco = loadEconomy();
            const guilds = eco.guilds;

            const entries = Object.entries(guilds)
                .filter(([guildId]) => isCoinEnabled(guildId))
                .map(([guildId, guild]) => {
                    const coinName = getCoinName(guildId);
                    const supply = guild.totalBalance ?? 0;
                    return { guildId, coinName, supply };
                });

            if (entries.length === 0) return null;

            const base = entries[0];
            const baseSupply = base.supply || 1;

            const embed = new EmbedBuilder()
                .setTitle('💱 コインレート一覧')
                .setDescription(`基準: **${base.coinName}**（1分ごとに自動更新）`)
                .setColor(0x00AE86)
                .setTimestamp();

            for (const entry of entries) {
                const rate = (entry.supply / baseSupply).toFixed(3);
                embed.addFields({
                    name: `${entry.coinName}`,
                    value: `• レート: **${rate}**\n• サーバーID: \`${entry.guildId}\``,
                    inline: false
                });
            }

            return embed;
        };

        const initialEmbed = generateEmbed();
        if (!initialEmbed) {
            return interaction.reply('有効なコインはまだありません。');
        }

        const message = await interaction.reply({ embeds: [initialEmbed], fetchReply: true });

        // 無限更新（明示的に停止しない限り続く）
        setInterval(async () => {
            try {
                const updatedEmbed = generateEmbed();
                if (!updatedEmbed) return;

                await message.edit({ embeds: [updatedEmbed] });
            } catch (err) {
                console.error('レートメッセージの更新に失敗しました。自動更新を停止します:', err);
                // 通常はメッセージが消えてるかBotに編集権限がない場合
                clearInterval(this);
            }
        }, 60 * 1000);
    }
};
