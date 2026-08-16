const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadEconomy, saveEconomy, getUserEc } = require('../systems/economy');

const BANK_USER_ID = '1352207314349981737';
const INTEREST_RATE = 0.01; // 年利1%

function applyInterest(userBank, bankUser) {
    const now = Date.now();
    const elapsedMs = now - userBank.lastInterest;
    if (elapsedMs <= 0) return;

    const yearMs = 1000 * 60 * 60 * 24 * 365;
    const interest = userBank.deposit * INTEREST_RATE * (elapsedMs / yearMs);
    const add = Math.floor(interest);
    if (add <= 0) {
        userBank.lastInterest = now;
        return;
    }

    // 銀行ユーザーの残高から支払う
    const payable = Math.min(add, bankUser.balance);

    if (payable > 0) {
        userBank.deposit += payable;
        bankUser.balance -= payable;
    }

    userBank.lastInterest = now;
}

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('bank-deposit')
        .setDescription('銀行にコインを預け入れます')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('預け入れる金額')
                .setMinValue(1)
                .setRequired(true)
        ),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const amount = interaction.options.getInteger('amount');

        const eco = loadEconomy();

        // 銀行ユーザー
        const bankUser = getUserEc(eco, guildId, BANK_USER_ID);

        // 一般ユーザー
        const user = getUserEc(eco, guildId, userId);

        // ★ 先に初期化
        if (!user.bank) {
            user.bank = {
                deposit: 0,
                lastInterest: Date.now()
            };
        }

        // 利息を反映
        applyInterest(user.bank, bankUser);


        if (user.balance < amount) {
            return interaction.reply({
                content: `💸 所持金が足りません（現在 ${user.balance}）`,
                ephemeral: true
            });
        }
   

        // 預金処理
        user.balance -= amount;
        user.bank.deposit += amount;
        bankUser.balance += amount;

        saveEconomy(eco);

        const embed = new EmbedBuilder()
            .setTitle('銀行 預け入れ完了')
            .setColor(0x00cc66)
            .addFields(
                { name: '預け入れ金額', value: `${amount}`, inline: true },
                { name: 'あなたの預金残高', value: `${user.bank.deposit}`, inline: true },
                { name: '所持金残高', value: `${user.balance}`, inline: true },
                { name: '銀行残高', value: `${bankUser.balance}`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
