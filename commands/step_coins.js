const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
    loadEconomy,
    saveEconomy,
    getGuildData,
    addBalance,
    setCoinName
} = require('../systems/economy');

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('step_coins')
        .setDescription('このサーバーのコインの名前を設定して経済システムを有効化します。')
        .addStringOption(option =>
            option.setName('coin_name')
                .setDescription('設定するコインの名前（例: 草餅コイン）')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const guild = interaction.guild;
        const guildId = guild.id;
        const coinName = interaction.options.getString('coin_name');

        // コイン名を設定
        setCoinName(guildId, coinName);

        // 経済データをロード
        const eco = loadEconomy();

        // SSPCの総発行数を取得
        const sspcData = getGuildData(eco, "1430524783237529603");
        if (!sspcData || typeof sspcData.totalBalance !== "number") {
            return interaction.reply("SSPC$ がまだ設定されていません。");
        }
        const totalSupply = sspcData.totalBalance;

        // サーバーメンバーを取得
        await guild.members.fetch();
        const members = guild.members.cache.filter(m => !m.user.bot);
        const memberCount = members.size;

        if (memberCount === 0) {
            return interaction.reply("一般メンバーがいません。");
        }

        // 1人あたりの分配量（最低1）
        let perMember = Math.floor(totalSupply / memberCount);
        if (perMember < 1) perMember = 1;

        // 分配処理
        for (const member of members.values()) {
            addBalance(eco, guildId, member.id, perMember);
        }

        // 保存
        saveEconomy(eco);

        await interaction.reply(
            `コイン名を「${coinName}」に設定しました。 `
        );
    }
};
