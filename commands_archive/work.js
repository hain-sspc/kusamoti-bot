const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    loadEconomy,
    saveEconomy,
    getUser,
    addBalance,
    getCoin,
    workrole,
    getDefaultCoin
} = require("../systems/economy");

const cooldowns = new Map();

const COOLDOWN_TIME =
    60 * 60 * 1000;

module.exports = {

    data: new SlashCommandBuilder()
        .setName("work")
        .setDescription("報酬をもらいます")
        .addStringOption(option =>
            option
                .setName('coin')
                .setDescription('コインID')
                .setRequired(false)
        ),

    async execute(interaction) {
        const eco =
            await loadEconomy();

        const userId =
            interaction.user.id;

        const guildId =
            interaction.guildId;

        let coinId = interaction.options.getString('coin');

        if (!coinId) {

            coinId = getDefaultCoin(
                eco,
                userId
            );

            if (!coinId) {
                return interaction.reply({
                    content: 'デフォルト通貨が設定されていません。',
                    ephemeral: true
                });
            }

        } else {
            coinId = coinId.toUpperCase();
        }

        // ===== クールダウン =====

        const now = Date.now();

        const lastUsed =
            cooldowns.get(userId);

        if (
            lastUsed &&
            now - lastUsed < COOLDOWN_TIME
        ) {

            const remaining =
                Math.ceil(
                    (
                        COOLDOWN_TIME -
                        (now - lastUsed)
                    ) / 1000 / 60
                );

            return interaction.reply({
                content:
                    ` 次の発行まで${remaining} 分`,
                ephemeral: true
            });
        }

        // ===== データ =====

    

        const coin =
            getCoin(coinId);

        if (!coin) {
            return interaction.reply({
                content:
                    "コインが存在しません",
                ephemeral: true
            });
        }

        // ===== 人数取得 =====

        const memberCount =
            interaction.guild.memberCount;

        // ===== 残発行量 =====

        const remainingSupply =
            coin.maxSupply -
            coin.supply;

        if (remainingSupply <= 0) {

            return interaction.reply({
                content:
                    "このコインはすべて発行済みです",
                ephemeral: true
            });
        }

        // ===== 基本報酬 =====

        let baseAmount =
            remainingSupply /
            1000000 /
            memberCount;

        // ===== ロールボーナス =====

        const roleData =
            workrole(guildId);

        const roleBonus =
            roleData?.roles || {};

        let bonusPercentage = 0;

        interaction.member.roles.cache.forEach(role => {

            if (roleBonus[role.id]) {
                bonusPercentage +=
                    roleBonus[role.id];
            }
        });

        const finalAmount =
            baseAmount *
            (1 + bonusPercentage / 100);

        // ===== 最低単位 =====

        const amount =
            Number(
                finalAmount.toFixed(6)
            );

        if (amount <= 0) {

            return interaction.reply({
                content:
                    "これ以上発行できません",
                ephemeral: true
            });
        }

        // ===== 発行 =====

        addBalance(
            eco,
            userId,
            coinId,
            amount
        );

        coin.supply += amount;

        cooldowns.set(
            userId,
            now
        );

        await saveEconomy(eco);

        // ===== Embed =====

        const embed =
            new EmbedBuilder()
                .setColor(0x00ff99)
                .setTitle("お仕事完了！")
                .addFields([
                    {
                        name: "報酬",
                        value:
                            `**${amount} ${coin.name}**`
                    },
                    {
                        name: "残発行量",
                        value:
                            `${(
                                coin.maxSupply -
                                coin.supply
                            ).toFixed(2)}`
                    }
                ])
                .setTimestamp();

        await interaction.reply({
            embeds: [embed]
        });
    }
};