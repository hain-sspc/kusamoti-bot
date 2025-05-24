const { SlashCommandBuilder } = require("discord.js");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");
const fs = require("fs").promises;
const path = require("path");

const rateHistoryPath = path.join(__dirname, "..", "rateHistory.json");
const economy = require("../economy.json");
const SSPC_ID = "1300434664347144262";

let rateHistory = {};



// 初期化
async function initializeRateHistory() {
    try {
        await fs.stat(rateHistoryPath);
    } catch {
        await fs.writeFile(rateHistoryPath, JSON.stringify({}));
    }

    try {
        rateHistory = JSON.parse(await fs.readFile(rateHistoryPath, "utf-8"));
    } catch (err) {
        console.error("rateHistory 読み込みエラー:", err);
        rateHistory = {};
    }
}

// SSPCのtotalCoins/totalStocksを0にしない
if (economy[SSPC_ID]) {
    if (economy[SSPC_ID].totalCoins === 0) economy[SSPC_ID].totalCoins = 1;
    if (economy[SSPC_ID].totalStocks === 0) economy[SSPC_ID].totalStocks = 1;
}

// 比率を取得
function getRateAgainstSSPC(guildId) {
    const data = economy[guildId];
    const sspcData = economy[SSPC_ID];

    if (!data || !sspcData || sspcData.totalCoins === 0 || sspcData.totalStocks === 0 || data.totalStocks === 0) {
        return 0;
    }

    const coinValue = data.totalCoins / data.totalStocks;
    const sspcValue = sspcData.totalCoins / sspcData.totalStocks;

    return coinValue / sspcValue;
}

// レート記録（1分ごとに呼ぶ）
async function recordRates() {
    const now = Date.now();
    for (const guildId of Object.keys(economy)) {
        if (guildId === SSPC_ID) continue;

        const rate = getRateAgainstSSPC(guildId);
        if (rate === 0 || isNaN(rate) || !isFinite(rate)) continue;

        if (!rateHistory[guildId]) rateHistory[guildId] = [];
        rateHistory[guildId].push({ time: now, value: rate });

        const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
        rateHistory[guildId] = rateHistory[guildId].filter(r => r.time >= weekAgo);
    }

    await fs.writeFile(rateHistoryPath, JSON.stringify(rateHistory, null, 2));
}

// チャート生成（/coin_graphコマンドで呼び出し）
async function generateChart() {
    const width = 1000;
    const height = 500;
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

    const datasets = [];
    for (const [guildId, history] of Object.entries(rateHistory)) {
        const guildData = history.filter(d => d.value !== 0 && isFinite(d.value));
        if (guildData.length === 0) continue;

        datasets.push({
            label: `Guild ${guildId}`,
            data: guildData.map(d => ({ x: new Date(d.time), y: d.value })),
            borderColor: getRandomColor(),
            tension: 0.2,
            fill: false,
        });
    }

    const configuration = {
        type: "line",
        data: { datasets },
        options: {
            scales: {
                x: {
                    type: "time",
                    time: { unit: "hour" },
                    title: { display: true, text: "時間" },
                },
                y: {
                    title: { display: true, text: "SSPC比率" },
                },
            },
            plugins: {
                legend: {
                    display: true,
                },
            },
        },
    };

    const image = await chartJSNodeCanvas.renderToBuffer(configuration);
    const outputPath = path.join(__dirname, "ratesChart.png");
    await fs.writeFile(outputPath, image);

    return outputPath;
}

// ランダムな色を生成
function getRandomColor() {
    return `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`;
}

initializeRateHistory(); // 起動時に初期化

module.exports = {
    data: new SlashCommandBuilder()
        .setName("coin_graph")
        .setDescription("過去1週間のコインレート推移を表示します。"),

    async execute(interaction) {
        try {
            const chartPath = await generateChart();

            await interaction.reply({
                content: "こちらが過去1週間のコインレート推移のグラフです。",
                files: [chartPath],
            });
        } catch (error) {
            console.error("グラフ生成エラー:", error);
            await interaction.reply("グラフの生成中にエラーが発生しました。");
        }
    },

    recordRates,
    generateChart,
};
