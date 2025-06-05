const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadEconomy, saveEconomy, getGuildData, getCoinName } = require('../economy');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('step_role')
        .setDescription('残高と引き換えで付与するロールの設定（管理者専用）')
        .addRoleOption(option => option.setName('role').setDescription('対象のロール').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('必要残高').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const role = interaction.options.getRole('role');
        const amount = interaction.options.getInteger('amount');

        // 経済データのロード
        const economy = loadEconomy();

        // ギルドデータ取得
        const guildData = getGuildData(economy, guildId);

        // コイン名取得（関数にguildIdを渡す）
        const coinName = getCoinName(guildId) || 'コイン';

        if (!Array.isArray(guildData.roleRewards)) {
            guildData.roleRewards = [];
        }

        const idx = guildData.roleRewards.findIndex(r => r.role === role.id);
        let replyText = '';

        if (idx !== -1) {
            guildData.roleRewards[idx].amount = amount;
            replyText = '既存のロール設定を更新しました：';
        } else {
            guildData.roleRewards.push({ role: role.id, amount });
            replyText = '新しいロール引き換え設定を追加しました：';
        }

        saveEconomy(economy);
        await interaction.reply(`${replyText} <@&${role.id}>  ${amount} ${coinName}`);
    },
};
