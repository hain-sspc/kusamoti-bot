const {
    SlashCommandBuilder,
    EmbedBuilder
} = require('discord.js');

const {
    loadEconomy,
    saveEconomy,
    transfer,
    getCoin,
    getDefaultCoin
} = require('../systems/economy');

module.exports = {

    data: new SlashCommandBuilder()

        .setName('pay')
        .setDescription('他ユーザーへ送金します')



        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('送金先')
                .setRequired(true)
        )

        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('送金額')
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

        }

        if (!coinId) {
            return interaction.reply({
                content: 'デフォルト通貨が設定されていません。',
                ephemeral: true
            });
        }

        coinId = coinId.toUpperCase();

        const targetUser =
            interaction.options.getUser('user');

        const amount =
            interaction.options.getInteger('amount');

        // 自分送金禁止
        if (targetUser.id === interaction.user.id) {

            return interaction.reply({
                content:
                    '自分自身には送金できません。',
                ephemeral: true
            });

        }

        // コイン存在確認
        const coin = getCoin(coinId);

        if (!coin) {

            return interaction.reply({
                content:
                    'コインが存在しません。',
                ephemeral: true
            });

        }

     

        // 送金
        const result = transfer(
            eco,
            interaction.user.id,
            targetUser.id,
            coinId,
            amount
        );

        // 失敗
        if (!result.success) {

            return interaction.reply({
                content: result.message,
                ephemeral: true
            });

        }

        // 保存
        saveEconomy(eco);

        // Embed
        const embed = new EmbedBuilder()

            .setTitle('送金完了')

            .setColor(0x00ff99)

            .addFields(
                {
                    name: '送信者',
                    value: interaction.user.tag,
                    inline: true
                },
                {
                    name: '受信者',
                    value: targetUser.tag,
                    inline: true
                },
                {
                    name: 'コイン',
                    value: coin.name,
                    inline: true
                },
                {
                    name: '金額',
                    value: String(amount),
                    inline: true
                }
            )

            .setTimestamp();

        await interaction.reply({
            embeds: [embed]
        });

    }
};