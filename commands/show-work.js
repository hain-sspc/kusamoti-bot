const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadEconomy, getUserEc, saveEconomy, getCoinName, workrole } = require('../systems/economy');





module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('show-work')
        .setDescription('報酬の詳細表示')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('表示するユーザー。指定しない場合は自分の報酬を表示します')),
    async execute(interaction) {

        const guildId = interaction.guildId;
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = targetUser.id;
        const member = await interaction.guild.members.fetch(userId);

        const roleData = workrole(guildId);
        const roleBonusList = roleData?.roles || {};

        const coinName = getCoinName(guildId);
        if (!coinName) {
            return interaction.reply({
                content: 'このサーバーではまだコインが設定されていません。\n管理者に `/step_coins` を実行してもらってください。',
                flags: 64
            });
        }

        const eco = loadEconomy();
        //const user = getUserEc(eco, guildId, userId);

        const serverEco = eco.guilds[guildId];
        const totalBalance = serverEco?.totalBalance || 0;

        // 基準給
        let baseAmount = Math.max(1, Math.floor(totalBalance / 100000));

        // 役職ボーナス計算
        let bonusPercentage = 0;
        let bonusSummary = [];
        try {
           member.roles.cache.forEach(role => {
                if (roleBonusList[role.id]) {

                    const percentage = roleBonusList[role.id];
                    bonusPercentage += percentage;

                    const individualBonus = Math.floor(baseAmount * (percentage / 100));
                    bonusSummary.push(`• <@&${role.id}> → +${individualBonus} ${coinName}`);
                }
            });
        } catch (erro) {
            console.log("エラーが発生しました",erro)
        }

        const bonusAmount = Math.floor(baseAmount * (bonusPercentage / 100));
        const totalReward = baseAmount + bonusAmount;
        let txt = "報酬合計";
        const cut = 1000000;
        if (totalReward > cut) {
            const cutReward = totalReward - cut;
            txt = `報酬合計(上限を超えているため${cutReward}${coinName}カットされます。)`;
        }
        const embed = new EmbedBuilder()
            .setColor(0x00ff99)
            .setTitle(`${targetUser.tag}の報酬`)
            .addFields(
                { name: `${txt}`, value: `**${totalReward} ${coinName}**`, inline: false },
                { name: '通常報酬', value: `**${baseAmount} ${coinName}**`, inline: false }
              
                
            )
            .setTimestamp();

        // ボーナスがある場合のみ表示
        if (bonusSummary.length > 0) {
            embed.addFields({
                name: '役職ごとの報酬', 
                value: bonusSummary.join('\n')
            });
        } else {
            embed.addFields({
                name: '役職ごとの報酬',
                value: 'なし'
            });
        }

        await interaction.reply({ embeds: [embed] });
    }
};
