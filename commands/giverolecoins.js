// 省略せずフルサンプル
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { addBalance } = require('../economy');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giverolecoins')
        .setDescription('指定したロールを持つ全メンバーにコインを付与・減算します（管理者専用）')
        .addRoleOption(opt =>
            opt.setName('role').setDescription('対象のロール').setRequired(true))
        .addIntegerOption(opt =>
            opt.setName('amount').setDescription('増減させるコイン数').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // 1) 初回応答：考え中… を返す
        await interaction.deferReply({ ephemeral: true });

        // 2) 管理者チェック
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.editReply({ content: '権限がありません。' });
        }

        const role = interaction.options.getRole('role');
        const amount = interaction.options.getInteger('amount');
        const guild = interaction.guild;

        // 3) 重い処理：全メンバーをフェッチ
        try {
            await guild.members.fetch();
        } catch (err) {
            console.error('メンバーフェッチ失敗:', err);
            return interaction.editReply({ content: 'メンバー情報の取得に失敗しました。' });
        }

        // 4) 一括コイン付与
        const targets = guild.members.cache.filter(m => m.roles.cache.has(role.id));
        let success = 0;
        for (const member of targets.values()) {
            try {
                addBalance(member.id, amount);
                success++;
            } catch (err) {
                console.error(`付与失敗: ${member.user.tag}`, err);
            }
        }

        // 5) 最終応答
        await interaction.editReply({
            content: `🎉 ${role.name} 所持 ${targets.size}名中 ${success}名に ${amount >= 0 ? `+${amount}` : amount} コインを適用しました。`
        });
    },
};
