const { SlashCommandBuilder } = require('discord.js');
const { loadEconomy, saveEconomy } = require('../systems/economy');

// スロットの絵柄リスト
const symbols = ['🍒', '🍋', '🔔', '🍇', '🍡', "🌸", "<:tetchi:1436356500963463280>", "<:kusamochi:1436356503551606999>", " <:hokorin:1436356501836140725>", " <:hairemonbanzai:1469235450643349596>", "<:akasa6565:1454675981397917890>", "<:unnamed:1450022291629936774>", "<:tux:1436304563773771856>", "<:emoji_54:1472104922383384799>", "<:gomen:1436356501286686832>; "]

function spinSlot() {
    return [
        symbols[Math.floor(Math.random() * symbols.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
        symbols[Math.floor(Math.random() * symbols.length)]
    ];
}

function calculatePayout(reel, bet) {
    const [a, b, c] = reel;
    if (a === b && b === c) return bet * 5; // 3つ揃いで5倍
    if (a === b || b === c || a === c) return bet * 2; // 2つ揃いで2倍
    return 0; // 揃わなければ0
}

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('slut')
        .setDescription('スロットを回してコインを稼ごう！')
        .addIntegerOption(option =>
            option.setName('bet')
                .setDescription('賭ける金額')
                .setRequired(true)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const bet = interaction.options.getInteger('bet');
        const eco = loadEconomy();

        const user = eco.guilds?.[guildId]?.users?.[userId];
        if (!user || user.balance < bet) {
            return interaction.reply('所持金が足りません。');
        }

        // スロットを回す
        const result = spinSlot();
        const payout = calculatePayout(result, bet);
        const net = payout - bet;

        user.balance += net;
        saveEconomy(eco);

        const outcome =
            payout === bet * 5 ? '🎉 ジャックポット！3つ揃い！'
                : payout === bet * 2 ? '✨ 2つ揃い！おめでとう！'
                    : '😢 揃いませんでした…また挑戦してね。';

        return interaction.reply(
            `**スロット結果**\n` +
            `| ${result.join(' | ')} |\n\n` +
            `${outcome}\n` +
            `現在の残高: ${user.balance}`
        );
    }
};
