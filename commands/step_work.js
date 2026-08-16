const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    PermissionFlagsBits,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder
} = require('discord.js');

const { workrole, getCoinName } = require('../systems/economy');

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('step_work')
        .setDescription('ロール別報酬を管理します')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {

      
        const guildId = interaction.guildId;
        const coinName = getCoinName(guildId) || 'コイン';

        const roleData = workrole(guildId);
        const roles = roleData?.roles || {};

        const components = [];

        // ===== 既存ロール一覧 =====
        if (Object.keys(roles).length > 0) {

            const select = new StringSelectMenuBuilder()
                .setCustomId('work_role_select')
                .setPlaceholder('報酬を変更するロールを選択');

            for (const roleId in roles) {
                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) continue;

                select.addOptions({
                    label: role.name,
                    description: `${roles[roleId]}%`,
                    value: roleId
                });
            }

            components.push(
                new ActionRowBuilder().addComponents(select)
            );
        }

        // ===== ロール追加ボタン =====
        const addButton = new ButtonBuilder()
            .setCustomId('add_work_role')
            .setLabel('ロールを追加')
            .setStyle(ButtonStyle.Primary);

        components.push(
            new ActionRowBuilder().addComponents(addButton)
        );

        await interaction.reply({
            components
        });
    }
};
