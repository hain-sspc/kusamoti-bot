const { SlashCommandBuilder,EmbedBuilder} = require('discord.js');

const { loadEconomy, saveEconomy, addBalance, getBalance, getCoin, getDefaultCoin } = require('../systems/economy');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('adjustbalance')
        .setDescription('ユーザーの残高を変更')



        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('対象ユーザー')
                .setRequired(true)
        )

        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('増減額')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('coin')
                .setDescription('コインID')
                .setRequired(false)
        ),

    async execute(interaction) {

        const eco = loadEconomy();

        let coinId = interaction.options.getString('coin');

        if (!coinId) {

            coinId = getDefaultCoin(
                eco,
                interaction.user.id
            );

            if (!coinId) {
                return interaction.reply({
                    content: 'デフォルト通貨が設定されていません。',
                    ephemeral: true
                });
            }

        } else {
            coinId = coinId.toUpperCase();
        }

        const targetUser =
            interaction.options.getUser('user');

        const amount =
            interaction.options.getInteger('amount');

        const coin = getCoin(coinId);

        if (!coin) {
            return interaction.reply({
                content: 'コインが存在しません。',
                ephemeral: true
            });
        }

        if (coin.ownerId !== interaction.user.id) {
            return interaction.reply({
                content: 'このコインを操作する権限がありません。',
                ephemeral: true
            });
        }

        const before = getBalance(eco, targetUser.id, coinId);

        addBalance(eco, targetUser.id, coinId, amount);

        saveEconomy(eco);

        const after = getBalance(eco, targetUser.id, coinId);

        const embed = new EmbedBuilder()
            .setTitle('残高調整')
            .setColor(amount >= 0 ? 0x00ff00 : 0xff0000)
            .addFields(
                { name: 'コイン', value: coin.name, inline: true },
                { name: '対象', value: targetUser.tag, inline: true },
                { name: '変更量', value: String(amount), inline: true },
                { name: '変更前', value: String(before), inline: true },
                { name: '変更後', value: String(after), inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};