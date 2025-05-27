const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const settingsPath = path.join(__dirname, '../data/settings.json');

function loadSettings() {
    if (fs.existsSync(settingsPath)) {
        return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
    return {};
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('show_step_roles')
        .setDescription('設定済みのロール引き換え一覧を表示します')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const settings = loadSettings()[guildId];

        if (!Array.isArray(settings) || settings.length === 0) {
            return interaction.reply({ content: '設定がありません。', ephemeral: true });
        }

        // Embed フィールド生成
        const fields = settings.map((e, i) => {
            const role = interaction.guild.roles.cache.get(e.role);
            return {
                name: `${i + 1}. ${role ? role.name : '不明なロール'}`,
                value: `必要コイン数: ${e.amount}`,
                inline: false
            };
        });

        const embed = {
            color: 0x00AE86,
            title: '🎟️ ロール引き換え設定一覧',
            fields,
            timestamp: new Date()
        };

        await interaction.reply({ embeds: [embed] });
    },
};
