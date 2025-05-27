const { SlashCommandBuilder } = require('discord.js');
const { loadEconomy, getUserEc, saveEconomy, getCoinName } = require('../economy');

// クールダウンマップ
const cooldowns = new Map();
const COOLDOWN_TIME = 60 * 60 * 1000; // 1時間

module.exports = {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('お仕事をしてお金を稼ぎます'),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user.id;

        // 経済機能が有効化されていない場合
        const coinName = getCoinName(guildId);
        if (!coinName) {
            return interaction.reply({
                content: 'このサーバーではまだコインが設定されていません。\n管理者に `/step_coins` を実行してもらってください。',
                ephemeral: true
            });
        }

        // クールダウンチェック
        const now = Date.now();
        const lastUsed = cooldowns.get(userId);

        if (lastUsed && now - lastUsed < COOLDOWN_TIME) {
            const remaining = ((COOLDOWN_TIME - (now - lastUsed)) / 1000 / 60).toFixed(1);
            return interaction.reply({
                content: `お仕事はクールダウン中です。あと **${remaining} 分** 待ってください。`,
                ephemeral: true
            });
        }

        cooldowns.set(userId, now);

        const eco = loadEconomy();
        const user = getUserEc(eco, guildId, userId);

        const amount = Math.floor(Math.random() * 901) + 100; // 100〜1000
        user.balance += amount;

        saveEconomy(eco);

        await interaction.reply(`お仕事完了！ ${amount} ${coinName} を獲得しました！`);
    }
};
