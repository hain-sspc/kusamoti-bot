const { SlashCommandBuilder } = require('discord.js');
const { loadEconomy, saveEconomy } = require('../economy');

function drawCard() {
    const cards = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 11]; 
    return cards[Math.floor(Math.random() * cards.length)];
}

function calculateTotal(hand) {
    let total = hand.reduce((sum, card) => sum + card, 0);
    let aces = hand.filter(card => card === 11).length;

    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }
    return total;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('ブラックジャックで遊ぶ')
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

        // カード配布
        const playerHand = [drawCard(), drawCard()];
        const dealerHand = [drawCard(), drawCard()];

        const playerTotal = calculateTotal(playerHand);
        const dealerTotal = calculateTotal(dealerHand);

        let result = '';
        if (playerTotal > 21) {
            result = 'バースト！あなたの負けです。';
            user.balance -= bet;
        } else if (dealerTotal > 21 || playerTotal > dealerTotal) {
            result = '🎉 勝ちました！';
            user.balance += bet;
        } else if (playerTotal < dealerTotal) {
            result = '😢 負けました。';
            user.balance -= bet;
        } else {
            result = '🤝 引き分けです。';
        }

        saveEconomy(eco);

        return interaction.reply(
            `🃏 **ブラックジャック**\n` +
            `あなたの手札: ${playerHand.join(', ')}（合計: ${playerTotal}）\n` +
            `ディーラーの手札: ${dealerHand.join(', ')}（合計: ${dealerTotal}）\n\n` +
            result + `\n💰 現在の残高: ${user.balance}`
        );
    }
};
