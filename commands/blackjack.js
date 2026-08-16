const {
    SlashCommandBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder
} = require('discord.js');
const { loadEconomy, saveEconomy, addServerTax } = require('../systems/economy');

function drawCard() {
    const cards = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 11];
    return cards[Math.floor(Math.random() * cards.length)];
}

function calculateTotal(hand) {
    let total = hand.reduce((a, b) => a + b, 0);
    let aces = hand.filter(c => c === 11).length;
    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }
    return total;
}

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('ブラックジャック（Hit/Stand対応）')
        .addIntegerOption(opt =>
            opt.setName('bet').setDescription('賭け金').setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const bet = interaction.options.getInteger('bet');
        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        const eco = loadEconomy();
        const user = eco.guilds?.[guildId]?.users?.[userId];

        if (!user) return interaction.editReply('ユーザーデータが見つかりませんでした。');
        if (user.balance < bet) return interaction.editReply('所持金が足りません。');

        const state = {
            playerHand: [drawCard(), drawCard()],
            dealerHand: [drawCard(), drawCard()],
            bet,
            balance: user.balance,
            guildId,
            userId
        };

        const playerTotal = calculateTotal(state.playerHand);
        if (playerTotal > 21) {
            user.balance -= bet;
            saveEconomy(eco);
            return interaction.editReply('開始時にバーストしました。あなたの負けです。');
        }

        const embed = createEmbed(state, 'あなたのターンです');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('bj_hit')
                .setLabel('ヒット')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('bj_stand')
                .setLabel('スタンド')
                .setStyle(ButtonStyle.Secondary)
        );

        const message = await interaction.editReply({ embeds: [embed], components: [row] });

        const filter = i => i.user.id === userId;
        const collector = message.createMessageComponentCollector({ filter, componentType: 2, time: 60000 });

        collector.on('collect', async i => {

            if (i.customId === 'bj_hit') {
                state.playerHand.push(drawCard());
                const pt = calculateTotal(state.playerHand);
                if (pt > 21) {
                    user.balance -= bet;
                    saveEconomy(eco);
                    await i.update({
                        embeds: [createEmbed(state, 'バーストしました！あなたの負けです。')],
                        components: []
                    });
                    collector.stop();
                } else {
                    await i.update({
                        embeds: [createEmbed(state, 'ヒットかスタンドを選択してください')],
                        components: [row]
                    });
                }
            } else if (i.customId === 'bj_stand') {
                await i.deferUpdate(); 

                await dealerPlay(state);
                const dealerTotal = calculateTotal(state.dealerHand);
                const playerTotal = calculateTotal(state.playerHand);

                let result = '';
                if (dealerTotal > 21 || playerTotal > dealerTotal) {
                    result = '🎉 勝ちました！';
                    user.balance += bet;
                    addServerTax(eco, guildId, -bet);
                } else if (playerTotal < dealerTotal) {
                    result = '😢 負けました。';
                    user.balance -= bet;
                    addServerTax(eco, guildId, bet);
                } else {
                    result = '🤝 引き分けです。';
                }

                saveEconomy(eco);

                // interactionではなく i に対して編集
                await i.editReply({
                    embeds: [createEmbed(state, `ゲーム終了: ${result}`)],
                    components: []
                });
                collector.stop();
            }

        });
    }
};

function createEmbed(state, title) {
    const dealerCardsDisplay = title.startsWith('ゲーム終了') ?
        `${state.dealerHand.join(', ')} (合計: ${calculateTotal(state.dealerHand)})` :
        `${state.dealerHand[0]}, ?`;

    return new EmbedBuilder()
        .setTitle('🃏 ブラックジャック')
        .setDescription(title)
        .addFields(
            { name: 'あなたの手札', value: `${state.playerHand.join(', ')} (合計: ${calculateTotal(state.playerHand)})`, inline: false },
            { name: 'ディーラーの手札', value: dealerCardsDisplay, inline: false },
            { name: '賭け金', value: `${state.bet}`, inline: false }
        )
        .setTimestamp();
}
//掛け金-
async function dealerPlay(state) {
    while (calculateTotal(state.dealerHand) < 17) {
        state.dealerHand.push(drawCard());
    }
}
