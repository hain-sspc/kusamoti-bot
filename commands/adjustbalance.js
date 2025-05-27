const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getBalance, addBalance, getCoinName } = require('../economy');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('adjustbalance')
        .setDescription('他のユーザーの所持金を増減します（管理者専用）')
        .addStringOption(option =>
            option.setName('user')
                .setDescription('ユーザーIDまたはメンション')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('増減額（例: 100, -50）')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const guildId = interaction.guildId;
        const coinName = getCoinName(guildId);
        if (!coinName) {
            return interaction.reply({
                content: 'このサーバーではまだコインが設定されていません。\nまず `/step_coins` を実行して経済システムを有効化してください。',
                ephemeral: true
            });
        }
        const userInput = interaction.options.getString('user').replace(/[<@!>]/g, '').trim();
        const amount = interaction.options.getInteger('amount');

        if (isNaN(userInput) || userInput.length < 17) {
            return interaction.reply({ content: 'ユーザーIDが正しくありません。', ephemeral: true });
        }

        try {
            const user = await interaction.client.users.fetch(userInput);
            addBalance(guildId, user.id, amount);
            const newBalance = getBalance(guildId, user.id);
            const coinName = getCoinName(guildId) || 'コイン';

            await interaction.reply(` ${user.tag} の残高を ${amount >= 0 ? `+${amount}` : amount} 調整しました。\n現在の残高: ${newBalance} ${coinName}`);
        } catch (error) {
            console.error('ユーザー取得エラー:', error);
            return interaction.reply({ content: 'ユーザーが見つかりませんでした。', ephemeral: true });
        }
    }
};