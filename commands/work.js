const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadEconomy, getUserEc, saveEconomy, getCoinName, addServerTax, workrole } = require('../systems/economy');
const config = require('../data/config.json');

const cooldowns = new Map();
const COOLDOWN_TIME = 60 * 60 * 1000; // 1時間

const BANK_USER_ID = config.botid; // 銀行ユーザー



module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('銀行から報酬をもらいます'),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user.id;

        const coinName = getCoinName(guildId) || 'コイン';

            const roleData = workrole(guildId);
        const roleBonus = roleData?.roles || {};
        // ===== クールダウン確認 =====
        const now = Date.now();
        const lastUsed = cooldowns.get(userId);
        if (lastUsed && now - lastUsed < COOLDOWN_TIME) {
            const remaining = Math.ceil((COOLDOWN_TIME - (now - lastUsed)) / 1000 / 60);
            return interaction.reply({
                content: `お仕事はクールダウン中です。あと ${remaining} 分待ってください。`,
                ephemeral: true
            });
        }

        // ===== 経済データ =====
        const eco = await loadEconomy();
        const user = getUserEc(eco, guildId, userId);
        const bankUser = getUserEc(eco, guildId, BANK_USER_ID);

        if (!user.balance) user.balance = 0;
        if (!bankUser.balance) bankUser.balance = 0;

        // ===== 報酬計算 =====
        const serverEco = eco.guilds[guildId];
        const totalBalance = serverEco?.totalBalance || 0;
        let baseAmount = Math.max(1, Math.floor(totalBalance / 100000));

        let bonusPercentage = 0;
        interaction.member.roles.cache.forEach(role => {
            if (roleBonus[role.id]) bonusPercentage += roleBonus[role.id];
        });

        const bonusAmount = Math.floor(baseAmount * (bonusPercentage / 100));
        const finalAmount = baseAmount + bonusAmount;

        const Amount = Math.min(finalAmount, 10000000000000000000);
        // ===== 支払い =====
        let bankPayment = Math.min(Amount, bankUser.balance);
        let taxPayment = Amount - bankPayment;

        if (bankPayment > 0) bankUser.balance -= bankPayment;
        if (taxPayment > 0) addServerTax(eco, guildId, -taxPayment); // 税金から補填
        
        
       
        user.balance += Amount;
      
        cooldowns.set(userId, now);

        await saveEconomy(eco);


      
        const embed = new EmbedBuilder()
            .setColor(0x00ff99)
            .setTitle('お仕事完了！')
            .addFields([
                { name: '報酬', value: `**${Amount} ${coinName}**`, inline: false },
            ])
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
