const { SlashCommandBuilder } = require('discord.js');
const { loadEconomy, saveEconomy, getUserEc, getCoinName } = require('../economy');

module.exports = {
    data: new SlashCommandBuilder()
        .setName("debt")
        .setDescription("借金をします")
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('借りたい金額')
                .setRequired(true)
        ),
    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        const amount = interaction.options.getInteger('amount');

        if (amount <= 0) {
            await interaction.reply({ content: "正の金額を指定してください。", ephemeral: true });
            return;
        }

        const economy = loadEconomy();
        const userData = getUserEc(economy, guildId, userId);
        const coinName = getCoinName(economy, guildId);

        // 借金初期化
        if (!userData.debt) userData.debt = 0;

       
        const actualBorrow = Math.min(amount);
        userData.balance += actualBorrow;
        userData.debt += actualBorrow;

        saveEconomy(economy);

        await interaction.reply(`${actualBorrow}${coinName} を借りました。現在の借金総額は ${userData.debt}${coinName} です。`);
    },
};
