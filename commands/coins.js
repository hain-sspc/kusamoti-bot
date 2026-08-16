const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadEconomy, getCoinName, isCoinEnabled } = require('../systems/economy');


module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('coins')
        .setDescription('コイン一覧を表示します'),

    async execute(interaction) {
        // Embedを作成する関数
        const generateEmbed = () => {
            const eco = loadEconomy();
            const guilds = eco.guilds;

            // 有効なコインのみ抽出し、情報をまとめる
            const entries = Object.entries(guilds)
                .filter(([guildId]) => isCoinEnabled(guildId))
                .map(([guildId, guild]) => {
                    const coinName = getCoinName(guildId);
                    const supply = typeof guild.totalBalance === 'number' ? guild.totalBalance : 0;
                    return { interaction, guildId, coinName, supply };
                });

            if (entries.length === 0) return null;

            // 基準にするサーバー（先頭のもの）
            const base = entries.find(entry => entry.guildId === interaction.guildId) || entries[0];
            const baseSupply = base.supply || 1;

            // Embed作成
            const embed = new EmbedBuilder()
                .setTitle('コイン一覧')
                .setColor(0x00AE86)
                .setTimestamp();

            // 各サーバーのレートを計算しフィールド追加
            for (const entry of entries) {
                const rate = baseSupply === 0 ? 'N/A' : (baseSupply / entry.supply).toFixed(3);
                embed.addFields({
                    name: `${entry.coinName}`,
                    value: `• 1 ${entry.coinName} = ${rate} ${base.coinName}`,
                    inline: false,
                });

            }

            return embed;
        };

        // 初回Embed生成
        const initialEmbed = generateEmbed();
        if (!initialEmbed) {
            return interaction.reply('有効なコインはまだありません。');
        }

        // 返信（fetchReplyで返信メッセージを取得）
        const message = await interaction.reply({ embeds: [initialEmbed], fetchReply: true });

        // 1分ごとにEmbedを自動更新
        const intervalId = setInterval(async () => {
            try {
                const updatedEmbed = generateEmbed();
                if (!updatedEmbed) {
                    clearInterval(intervalId);
                    return;
                }
                await message.edit({ embeds: [updatedEmbed] });
            } catch (error) {
                console.error('❌ 自動更新エラー:', error);
                clearInterval(intervalId);
            }
        }, 60 * 1000);
    }
};
