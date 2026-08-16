const { SlashCommandBuilder, PermissionFlagsBits,EmbedBuilder } = require('discord.js');
const { loadEconomy, saveEconomy, getGuildData, getUserEc, getCoinName } = require('../systems/economy');
const bankID = "1352207314349981737"
module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('role')
        .setDescription('残高を使ってロールを引き換えます')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('取得したいロール')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true }); // Deprecatedだけど一旦維持

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const role = interaction.options.getRole('role');

        const economy = loadEconomy();
        const guildData = getGuildData(economy, guildId);
        const userData = getUserEc(economy, guildId, userId);
        const bankData = getUserEc(economy, guildId, bankID);
        const coinName = getCoinName(guildId) || 'コイン';

        try {
            const reward = guildData.roleRewards?.find(r => r.role === role.id);
            if (!reward) {
                return interaction.editReply('そのロールは引き換え対象ではありません。');
            }

            if (userData.balance < reward.amount) {
                return interaction.editReply(`残高不足です（所持: ${userData.balance}${coinName} / 必要: ${reward.amount}${coinName}）`);
            }

            const member = await interaction.guild.members.fetch(userId1);
            if (member.roles.cache.has(role.id)) {
                return interaction.editReply('すでにこのロールを所持しています。');
            }

        } catch (e) {
            await interaction.editReply('えっろ');
        }
        
        try {
            await member.roles.add(role.id);
            userData.balance -= reward.amount;
            bankData.balance += reward.amount;
            saveEconomy(economy);
            const embed = new EmbedBuilder()
                .setColor(0x00AE86)
                .setTitle('引き換え完了！')
                .addFields(
                    { name: 'role', value: `${role.name}`, inline: true },
                    { name: '残高', value: ` ${userData.balance}${coinName}`, inline: true },
                    
                )
                .setTimestamp();
           // `✅ ${role.name} を引き換えました！\n💰 残高: ${userData.balance} ${coinName}`
            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error('ロール付与エラー:', err);
            return interaction.editReply('ロールの付与に失敗しました。');
        }
    },
};
