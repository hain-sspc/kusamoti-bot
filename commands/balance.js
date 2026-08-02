const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const { loadEconomy, getWallet, getCoin} = require('../systems/economy');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('所持金を確認します')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('表示するユーザー')
        ),

    async execute(interaction) {

        const targetUser =
            interaction.options.getUser('user')
            || interaction.user;

        const eco = loadEconomy();

       
    
        const wallet = getWallet(eco, targetUser.id);

        let walletText = '';

        const entries = Object.entries(wallet);

        console.log("wallet:", wallet);
        console.log("entries:", entries);

        if (entries.length === 0) {

            walletText = '所持コインなし';

        } else {

            walletText = entries
                .map(([coinId, amount]) => {

                    const coin = getCoin(coinId);

                    const coinName =
                        coin?.name || coinId;

                    return `${coinName}: ${amount}`;

                })
                .join('\n');

        }

        const embed = new EmbedBuilder()
            .setTitle(`${targetUser.tag} のウォレット`)
            .setColor(0x0099ff)
            .addFields({
                name: '所持コイン',
                value: walletText
            })
            .setTimestamp();

        await interaction.reply({
            embeds: [embed]
        });

    }
};