import { SlashCommandBuilder, EmbedBuilder, CommandInteraction, Role, GuildMember } from 'discord.js';
import { loadEconomy, getUserEc, getCoinName } from '../systems/economy';

const roleBonusList: Record<string, number> = {
    "1435980419291021402": 10000, //主席
    "1435980421933305957": 5000, //副主席
    "1435980425850912829": 5000, //人民指導
    "1435980420595449979": 3000, //主席補
    "1435980423195787274": 2500, //副主席補
    "1435980470885158913": 5000, //議長
    "1435980472214884362": 3000, //議員
    "1435980481962446958": 1000, //草検1
    "1435980482797113440": 500,  //草検2
    "1435980484093022361": 300,  //草検3
    "1435980486194364608": 200,  //草検4
    "1435980616469582008": 100   //草検5
};

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('show-work')
        .setDescription('報酬の詳細表示'),

    async execute(interaction: CommandInteraction) {

        const guildId = interaction.guildId;
        if (!guildId) return interaction.reply({ content: 'サーバー内で実行してください。', ephemeral: true });
        const userId: string = interaction.user.id;

        const coinName = getCoinName(guildId);
        if (!coinName) {
            return interaction.reply({ content: 'このサーバーではまだコインが設定されていません。', ephemeral: true });
        }

        interface UserEc {
            balance: number;
            coins: number;
            debt: number;
            foreignBalance: Record<string, number>;
            bank: {
                deposit: number;
                lastInterest: number;
            };
        }

        interface Guild {
            totalBalance: number;
            totalCoins: number;
            users: Record<string, UserEc>;
            tax: number;
        }

        interface Economy {
            guilds: Record<string, Guild>;
        }

        const eco: Economy = loadEconomy();
        const user: UserEc = getUserEc(eco, guildId, userId);

        interface Guild {
            totalBalance: number;
            // ここに必要なプロパティを追加
        }

        interface Economy {
            guilds: Record<string, Guild>;
        }

        const serverEco: Guild = eco.guilds[guildId];
        const totalBalance: number = serverEco?.totalBalance || 0;

        // 基準給
        let baseAmount: number = Math.max(1, Math.floor(totalBalance / 100000));

        // 役職ボーナス計算
        let bonusPercentage: number = 0;
        let bonusSummary: string[] = [];
        const member = interaction.member as GuildMember;
        member.roles.cache.forEach((role: Role) => {
            const percentage: number = roleBonusList[role.id] || 0;
            bonusPercentage += percentage;

            const individualBonus: number = Math.floor(baseAmount * (percentage / 100));
            bonusSummary.push(`• <@&${role.id}> → +${individualBonus} ${coinName}`);
        });


        const bonusAmount: number = Math.floor(baseAmount * (bonusPercentage / 100));
        const totalReward: number = baseAmount + bonusAmount;
        const Reward: number = Math.min(totalReward,1000000)
        const embed = new EmbedBuilder();
        embed.setColor(0x00ff99);
        embed.setTitle('報酬を詳細表示します');
        embed.addFields(
            { name: '報酬合計', value: `**${Reward} ${coinName}**`, inline: false },
            { name: '通常報酬', value: `**${baseAmount} ${coinName}**`, inline: false }
        );
        embed.setTimestamp();

        // ボーナス表示
      
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
