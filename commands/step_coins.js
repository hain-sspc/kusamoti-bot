const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
    loadEconomy,
    saveEconomy,
    createCoin
} = require('../systems/economy');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('step_coins')
        .setDescription('コインを作成します。')
        .addStringOption(option =>
            option.setName('coin_name')
                .setDescription('コインの名前')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('maxsupply')
                .setDescription('最大発行数')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('coin_id')
                .setDescription('id')
                .setRequired(false)),

    async execute(interaction) {
        const getcoinId = interaction.options.getString('coin_id');
        const getmaxSupply = interaction.options.getString('maxsupply');


        let coinId = getcoinId;
        if (coinId === null) {
            coinId =
                Math.floor(
                    Math.random() * 900
                ) + 100;
        };
        coinId = String(coinId);

        const coinName = interaction.options.getString('coin_name');


       
        let maxSupply ;

        if (getmaxSupply === null) {

            maxSupply = 21000000;

        } else {

            maxSupply =
                Number(getmaxSupply);

            if (isNaN(maxSupply)) {

                return interaction.reply({
                    content: '最大発行数は数字で入力してください',
                    ephemeral: true
                });
            }
        }

        const ownerId = interaction.user.id;

        createCoin({
            coinId,
            name: coinName,
            ownerId,
            supply: 0,
            maxSupply
        });

        await interaction.reply({
            content:
                `${coinName} (${coinId}) を作成しました`
        });

    }
}




