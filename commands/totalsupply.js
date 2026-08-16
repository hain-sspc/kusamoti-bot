const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadEconomy, getCoinName, isCoinEnabled } = require('../systems/economy');

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('totalsupply')
        .setDescription('全サーバーのコイン発行枚数を表示します'),

    async execute(interaction) {
        const eco = loadEconomy();
        const guilds = eco.guilds;

        const entries = Object.entries(guilds)
            .filter(([guildId]) => isCoinEnabled(guildId))
            .map(([guildId, guild]) => {
                const coinName = getCoinName(guildId) || '未設定コイン';
                const supply = typeof guild.totalBalance === 'number' ? guild.totalBalance : 0;
                return { guildId, coinName, supply };
            });

        if (entries.length === 0) {
            return interaction.reply('📭 有効なコインは見つかりませんでした。');
        }

        const totalSupply = entries.reduce((sum, e) => sum + e.supply, 0);

        const embed = new EmbedBuilder()
            .setTitle(' 各コインの発行枚数（totalBalance）')
            .setColor(0x00cc99)
            .setTimestamp()
            .setFooter({ text: `総発行量合計: ${totalSupply}` });

        for (const entry of entries) {
            embed.addFields({
                name: `${entry.coinName}`,
                value: `• 発行枚数: **${entry.supply}**\n• サーバーID: \`${entry.guildId}\``,
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed] });
    }
};
