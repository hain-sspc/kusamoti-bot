const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const { getCoinName, loadEconomy } = require('../systems/economy');

const HISTORY_PATH = path.join(__dirname, '..', 'data', 'rate_history.json');
const eco = loadEconomy();
module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('graph')
        .setDescription('自サーバーのコインと指定サーバーのレート推移をグラフで表示します')
    
        .addStringOption(option =>
            option.setName('target')
                .setDescription('対象のコイン名またはサーバーID')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(option =>
            option.setName('range')
                .setDescription('表示範囲')
                .addChoices(
                    { name: '全て', value: 'all' },
                    { name: '1か月', value: 'month' },
                    { name: '1週間', value: 'week' },
                    { name: '1日', value: 'day' },
                    { name: '1時間', value: 'hour' }
                )
        ),
    async autocomplete(interaction) {
        const currentGuildId = interaction.guild.id;
        const focusedValue = interaction.options.getFocused();

        async function loadGuildChoices(currentGuildId) {
            try {
              
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
        console.log('[GRAPH] コマンド実行:', interaction.user.tag, '対象:', interaction.options.getString('target'));
        await interaction.deferReply(); // 🔹 三秒対策

        try {
            const target = interaction.options.getString('target');
            const range = interaction.options.getString('range') || 'day';
            const selfGuildId = interaction.guildId;
            const selfCoin = getCoinName(selfGuildId);

            let history = JSON.parse(fs.readFileSync(HISTORY_PATH));
            console.log(`[GRAPH] 読み込んだ履歴件数: ${history.length}`);

            // 範囲フィルタ
            const now = Date.now();
            let threshold = 0;
            switch (range) {
                case 'hour': threshold = now - 1 * 60 * 60 * 1000; break;
                case 'day': threshold = now - 24 * 60 * 60 * 1000; break;
                case 'week': threshold = now - 7 * 24 * 60 * 60 * 1000; break;
                case 'month': threshold = now - 30 * 24 * 60 * 60 * 1000; break;
                case 'all': threshold = 0; break;
            }
            if (threshold > 0) history = history.filter(h => new Date(h.timestamp).getTime() >= threshold);
            console.log(`[GRAPH] フィルタ後の履歴件数: ${history.length}`);

            if (history.length === 0) return interaction.editReply('表示できる履歴がありません。');

            const labels = history.map(entry =>
                new Date(entry.timestamp).toLocaleString('ja-JP', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                })
            );

            const datasets = [];

            // --- 単一サーバー表示部分 ---
            if (target !== 'all') {
                const targetEntry = Object.entries(eco.guilds).find(
                    ([id]) => id === target || getCoinName(id) === target
                );
                if (!targetEntry) return interaction.editReply('対象のサーバーが見つかりません。');

                const [targetGuildId] = targetEntry;
                const targetCoin = getCoinName(targetGuildId);

                const baseRates = []; // 発行量のみ
                const demandRates = []; // 需要補正あり

                for (const entry of history) {
                    const tBal = entry.balances[targetGuildId] || 0;
                    const sBal = entry.balances[selfGuildId] || 0;

                    // --- 基礎価格のみ ---
                    const baseRate = (tBal === 0 || sBal === 0) ? null : parseFloat((sBal / tBal).toFixed(3));
                    baseRates.push(baseRate);

                    // --- 需要補正あり ---
                    // --- 需要補正あり（現在の方式に合わせる） ---
                    const tDemand = entry.demands?.[targetGuildId] || 0;
                    const sDemand = entry.demands?.[selfGuildId] || 0;

                    let demandRate = null;

                    if (tBal !== 0 && sBal !== 0) {
                        let rate = sBal / tBal;
                        rate *= (1 + tDemand);
                        rate /= (1 + sDemand);

                        demandRate = parseFloat(rate.toFixed(3));
                    }

                    demandRates.push(demandRate);
                }

                datasets.push({
                    label: `基礎価格: 1 ${selfCoin} ➜ ${targetCoin}`,
                    data: baseRates,
                    borderColor: 'rgba(255,0,0,1)', // 赤
                    fill: false,
                    tension: 0.3
                });

                datasets.push({
                    label: `需要補正: 1 ${selfCoin} ➜ ${targetCoin}`,
                    data: demandRates,
                    borderColor: 'rgba(0,0,255,1)', // 青
                    fill: false,
                    tension: 0.3
                });
            } else {
                const targetEntry = Object.entries(eco.guilds).find(([id]) => id === target || getCoinName(id) === target);
                if (!targetEntry) return interaction.editReply('対象のサーバーが見つかりません。');

                const [targetGuildId] = targetEntry;
                const targetCoin = getCoinName(targetGuildId);

                const rates = history.map(entry => {
                    const tBal = entry.balances[targetGuildId] || 0;
                    const sBal = entry.balances[selfGuildId] || 0;
                    const rate = (tBal === 0 || sBal === 0) ? null : parseFloat((sBal / tBal).toFixed(3));
                    console.log(`[GRAPH][${targetCoin}] ${entry.timestamp}: sBal=${sBal}, tBal=${tBal}, rate=${rate}`);
                    return rate;
                });

                datasets.push({
                    label: `1 ${selfCoin} ➜ ${targetCoin}`,
                    data: rates,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    fill: false,
                    tension: 0.3
                });
            }

            if (datasets.length === 0) return interaction.editReply('レートデータが不足しています。');

            const canvas = new ChartJSNodeCanvas({ width: 800, height: 400, backgroundColour: 'white' });
            const config = {
                type: 'line',
                data: { labels, datasets },
                options: {
                    responsive: false,
                    plugins: {
                        title: {
                            display: true,
                            text: target === 'all'
                                ? `${selfCoin} ➜ 全サーバーのレート推移 (${range})`
                                : `${datasets[0].label} (${range})`
                        }
                    },
                    scales: { y: { beginAtZero: true } }
                }
            };

            const image = await canvas.renderToBuffer(config);
            console.log('[GRAPH] グラフ生成完了');

            await interaction.editReply({
                files: [{ attachment: image, name: 'rate_graph.png' }]
            });
        } catch (err) {
            console.error('[GRAPH ERROR]', err);
            await interaction.editReply(`❌ エラー: ${err.message || err}`);
        }
    }
};

function getRandomColor() {
    const r = Math.floor(Math.random() * 200);
    const g = Math.floor(Math.random() * 200);
    const b = Math.floor(Math.random() * 200);
    return `rgba(${r}, ${g}, ${b}, 1)`;
}
