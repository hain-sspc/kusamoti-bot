const { SlashCommandBuilder } = require('discord.js');
const { loadEconomy, saveEconomy, getCoinName } = require('../economy');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('adjust_global')
        .setDescription('指定したサーバーまたは全サーバーのユーザーの残高やコインを指定したパーセンテージで増減させます')
        .addStringOption(option =>
            option.setName('target')
                .setDescription('対象のサーバーIDまたは "all" を指定')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('type')
                .setDescription('調整対象: balance または coins')
                .setRequired(true)
                .addChoices(
                    { name: 'balance', value: 'balance' },
                    { name: 'coins', value: 'coins' }
                ))
        .addNumberOption(option =>
            option.setName('percentage')
                .setDescription('増減させるパーセンテージ（例: 10 または -10）')
                .setRequired(true)),
    async execute(interaction) {
        const target = interaction.options.getString('target');
        const type = interaction.options.getString('type');
        const percentage = interaction.options.getNumber('percentage');

        const eco = loadEconomy();
        const guildIds = target === 'all' ? Object.keys(eco.guilds) : [target];

        let adjustedUsers = 0;

        for (const guildId of guildIds) {
            const guild = eco.guilds[guildId];
            if (!guild) continue;

            for (const userId in guild.users) {
                const user = guild.users[userId];
                if (typeof user[type] !== 'number') continue;

                const adjustment = Math.floor(user[type] * (percentage / 100));
                user[type] += adjustment;
                adjustedUsers++;
            }
        }

        saveEconomy(eco);

        await interaction.reply(" ${adjustedUsers}人のユーザーの${type}を${percentage}%調整しました。");
    },
};
