const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const settingsPath = path.join(__dirname, '../data/economy.json');

function loadSettings() {
    if (fs.existsSync(settingsPath)) {
        return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
    return {};
}

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('show_step_roles')
        .setDescription('設定済みのロール引き換え一覧を表示します')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const economyData = loadSettings();

        console.log('guildId:', guildId);
        console.log('economyData keys:', Object.keys(economyData));

        const guildData = economyData.guilds?.[guildId];

        console.log('guildData:', guildData);

        if (!guildData) {
            return interaction.reply({ content: '⚠ ギルドデータが見つかりません。', ephemeral: true });
        }

        if (!Array.isArray(guildData.roleRewards) || guildData.roleRewards.length === 0) {
            return interaction.reply({ content: '⚠ このサーバーに設定されたロール引き換えはありません。', ephemeral: true });
        }

        const fields = guildData.roleRewards.map((reward, index) => {
            const role = interaction.guild.roles.cache.get(reward.role);
            return {
                name: `${index + 1}. ${role ? role.name : `不明なロール（ID: ${reward.role}）`}`,
                value: `必要コイン数: ${reward.amount}`,
                inline: false
            };
        });

        const embed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle('ロール引き換え設定一覧')
            .addFields(fields)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },

};
