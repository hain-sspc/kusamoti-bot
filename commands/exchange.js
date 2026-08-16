const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
    loadEconomy, saveEconomy,
    getCoinName, addServerTax, loadTaxRate, calculateRate
} = require('../systems/economy');

const { addDemand, getDemandIndex } = require('../demandMemory');

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('exchange')
        .setDescription('他のサーバーのコインと交換します')
        .addStringOption(option =>
            option.setName('target_guild')
                .setDescription('交換先のサーバー')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('交換する金額')
                .setRequired(true)
    ),
    async autocomplete(interaction) {
        const currentGuildId = interaction.guild.id;
        const focusedValue = interaction.options.getFocused();

        async function loadGuildChoices(currentGuildId) {
            try {
                const eco = await loadEconomy();
                const choices = [];

                for (const guildId of Object.keys(eco.guilds)) {
                    if (guildId === currentGuildId) continue;

                    const coinName = getCoinName(guildId);
                    if (!coinName) continue; // コイン未設定ならスキップ

                    choices.push({ name: coinName, value: guildId });
                }

                return choices.slice(0, 25);
            } catch (error) {
                console.error('Error loading guild choices:', error);
                return [];
            }
        }

        const choices = (await loadGuildChoices(currentGuildId))
            .filter(c => focusedValue === '' || c.name.includes(focusedValue))
            .slice(0, 25);

        await interaction.respond(
            choices.map(c => ({ name: c.name, value: c.value }))
        );
    },


    async execute(interaction) {
        try {
            await interaction.deferReply();
           
           
            const userId = interaction.user.id;
            const fromGuildId = interaction.guild.id;
            const toGuildId = interaction.options.getString('target_guild');
            const amount = interaction.options.getInteger('amount');
       
 
            
        

      
            if (fromGuildId === toGuildId) {
                return interaction.editReply('同じサーバー間では交換できません。');
            }

            const eco = await loadEconomy();
            if (!eco?.guilds) {
                return interaction.editReply('経済データの読み込みに失敗しました。');
            }

            const fromGuild = eco.guilds[fromGuildId];
            const toGuild = eco.guilds[toGuildId];

            if (!fromGuild || !toGuild) {
                return interaction.editReply('サーバーデータが存在しません。');
            }

            fromGuild.users ||= {};
            toGuild.users ||= {};
            fromGuild.users[userId] ||= { balance: 0 };
            toGuild.users[userId] ||= { balance: 0 };

            const fromUser = fromGuild.users[userId];

            if (fromUser.balance < amount) {
                return interaction.editReply('残高が不足しています。');
            }

            // 税率取得
            const taxData = (typeof loadTaxRate === 'function') ? await loadTaxRate() : {};
            const taxRate = taxData?.payTaxRate ?? 0.05;

            const tax = Math.floor(amount * taxRate);
            const amountAfterTax = amount - tax;

            // ====== ここが価格計算の本体 ======

            const fromSupply = fromGuild.totalBalance || 1;
            const toSupply = toGuild.totalBalance || 1;

            const fromDemand = getDemandIndex(fromGuildId) || 0;
            const toDemand = getDemandIndex(toGuildId) || 0;

            // rate を calculateRate 関数で計算
            const rate = calculateRate(fromSupply, toSupply, fromDemand, toDemand);
            
            // 税引き後の受取量
            const received = Math.floor(amountAfterTax * rate);
            const limit = toGuild.totalBalance * 0.01;

            const fromCoin = getCoinName(fromGuildId) || 'Aコイン';
            const toCoin = getCoinName(toGuildId) || 'Bコイン';

            if (received > limit) {
                return interaction.editReply(
                    `受け取り量の制限を超えています (${received}${toCoin} > ${Math.floor(limit)}${toCoin})`
                );
            }

            console.log(`
[EXCHANGE]
fromSupply=${fromSupply}
toSupply=${toSupply}
fromDemand=${fromDemand}
toDemand=${toDemand}
rate=${rate}
received=${received}
            `);

            // ====== 残高更新 ======
          
            fromUser.balance -= amount;
            fromGuild.totalBalance -= amount;

            toGuild.users[userId].balance += received;
            toGuild.totalBalance += received;

            // 税金加算
            if (typeof addServerTax === 'function') {
                await addServerTax(eco, fromGuildId, tax);
              
            }
            const toGuilddemand = received / toSupply;
            const fromGuilddemand = amount / fromSupply;
            // 需要追加（買われた側）
            addDemand(toGuildId, fromGuilddemand);
            
            addDemand(fromGuildId, -fromGuilddemand );
            await saveEconomy(eco);

            console.log("DEMAND CHECK", {
                fromDemand,
                toDemand
            });

            const embed = new EmbedBuilder()
                .setTitle('交換完了')
                .setColor(0x00AE86)
                .addFields(
                    { name: '支払', value: `${amount} ${fromCoin}` },
                    { name: '受取', value: `${received} ${toCoin}` },
                    { name: '税金', value: `${tax} ${fromCoin}` },
                    { name: 'レート', value: rate.toFixed(6) }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Exchange error:', error);
            await interaction.editReply('⚠ エラーが発生しました。');
        }
    }
};
