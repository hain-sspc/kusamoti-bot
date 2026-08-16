const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { loadGuildData } = require('../messageLogger');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const ChartDataLabels = require('chartjs-plugin-datalabels');



const width = 1000;
const height = 600;
const chartCanvas = new ChartJSNodeCanvas({ width, height });
const MINUTE = 60 * 1000;
const HOUR = 60 * 60 * 1000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('messagegraph')
        .setDescription('メッセージ割合グラフ')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('グラフの種類')
                .addChoices(
                    { name: '線グラフ', value: 'line' },
                    { name: '円グラフ', value: 'pie' },
                    { name: '履歴', value: 'historypie' }
                )
        )
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('集計モード')
                .addChoices(
                    { name: 'long (72h)', value: 'long' },
                    { name: 'short (24h)', value: 'short' }
                )
        ),

    async execute(interaction) {
        const graphType = interaction.options.getString('type') || 'line';
        const mode = interaction.options.getString('mode') || 'long';

        await interaction.deferReply();
        const guildId = interaction.guild.id;
      

        const raw = loadGuildData(guildId);
        const guildData = raw.logs;

        if (!guildData) return interaction.editReply('このサーバーのデータはありません。');

        // JST固定で時系列変換
        const entries = Object.entries(guildData)
            .filter(([k]) => k.includes('T'))
            .map(([k, v]) => ({ time: new Date(k + ':00+09:00').getTime(), data: v }))
            .filter(e => !isNaN(e.time))
            .sort((a, b) => a.time - b.time);

        if (entries.length === 0) return interaction.editReply('データがありません。');

        const minuteMap = new Map(entries.map(e => [e.time, e.data]));

        const now = Math.floor(Date.now() / MINUTE) * MINUTE;
        const MODE_CONFIG = {
            long: 72 * HOUR,   // 72時間
            short: 24 * HOUR   // 24時間
        };
        const period = MODE_CONFIG[mode] || MODE_CONFIG.long;

        // 24h～72hランキング計算（pie用）
        const counts = new Map();
        let total = 0;
        for (let t = now - period; t <= now; t += MINUTE) {
            const data = minuteMap.get(t);
            if (!data) continue;
            total += data.total || 0;
            for (const [userId, count] of Object.entries(data.users || {})) {
                counts.set(userId, (counts.get(userId) || 0) + count);
            }
        }
        if (total === 0) return interaction.editReply('指定期間のデータがありません。');

        const finalCounts = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        const topUserIds = finalCounts.map(u => u[0]);
        if (topUserIds.length === 0) return interaction.editReply('集計データがありません。');

        // サブアカウント読み込み
        const SUB_PATH = path.join(__dirname, '../data/subAccounts.json');
        let subData = {};
        if (fs.existsSync(SUB_PATH)) subData = JSON.parse(fs.readFileSync(SUB_PATH, 'utf8'));
        const guildSubs = subData[guildId] || {};

        const colors = [
            '#ff6384', '#36a2eb', '#ffce56', '#4bc0c0', '#9966ff',
            '#ff9f40', '#8dd17e', '#d65db1', '#2c73d2', '#00c9a7'
        ];

        if (graphType === 'line') {
            // ===== lineグラフ（前と同じ） =====
            const labels = [];
            const tempDataMap = new Map();
            const rollingCounts = new Map();
            let rollingTotal = 0;

            const DAY = 24 * HOUR;
            const windowStart = now - period; // modeに応じた期間

            // 初期24時間構築
            for (let t = windowStart; t < now; t += MINUTE) {
                const data = minuteMap.get(t);
                if (!data) continue;
                rollingTotal += data.total || 0;
                for (const [userId, count] of Object.entries(data.users)) {
                    rollingCounts.set(userId, (rollingCounts.get(userId) || 0) + count);
                }
            }

            for (let t = windowStart; t <= now; t += MINUTE) {
                const currentData = minuteMap.get(t);
                if (currentData) {
                    rollingTotal += currentData.total || 0;
                    for (const [userId, count] of Object.entries(currentData.users)) {
                        rollingCounts.set(userId, (rollingCounts.get(userId) || 0) + count);
                    }
                }

                const oldData = minuteMap.get(t - period);
                if (oldData) {
                    rollingTotal -= oldData.total || 0;
                    for (const [userId, count] of Object.entries(oldData.users)) {
                        const newValue = (rollingCounts.get(userId) || 0) - count;
                        if (newValue <= 0) rollingCounts.delete(userId);
                        else rollingCounts.set(userId, newValue);
                    }
                }

                labels.push(new Date(t).toLocaleTimeString('ja-JP', {
                    timeZone: 'Asia/Tokyo',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                }));

                for (const userId of topUserIds) {
                    if (!tempDataMap.has(userId)) tempDataMap.set(userId, []);
                    const count = rollingCounts.get(userId) || 0;
                    tempDataMap.get(userId).push(Number(((rollingTotal > 0 ? (count / rollingTotal) * 100 : 0)).toFixed(4)));
                }
            }

            const users = await Promise.all(topUserIds.map(id => interaction.client.users.fetch(id).catch(() => null)));
            const datasets = topUserIds.map((userId, i) => ({
                label: users[i] ? users[i].username : 'Unknown',
                data: tempDataMap.get(userId),
                fill: false,
                tension: 0.2
            }));

            const configuration = {
                type: 'line',
                data: { labels, datasets },
                options: {
                    responsive: false,
                    scales: {
                        y: { beginAtZero: true, min: 0, max: 100, title: { display: true, text: `${period / HOUR}h message (%)` } }
                    }
                }
            };

            const buffer = await chartCanvas.renderToBuffer(configuration);
            const attachment = new AttachmentBuilder(buffer, { name: 'message_line.png' });
            return interaction.editReply({ files: [attachment] });
        }

        // ===== pie / historypie 共通処理 =====
        const subToMain = new Map();
        for (const mainId in guildSubs) for (const subId of guildSubs[mainId]) subToMain.set(subId, mainId);

        const countMap = new Map(finalCounts);
        const groups = [];

        for (const [userId, count] of finalCounts) {
            if (subToMain.has(userId)) continue;
            const subs = guildSubs[userId] || [];
            let totalCount = count;
            for (const subId of subs) totalCount += countMap.get(subId) || 0;
            groups.push({ mainId: userId, mainCount: count, total: totalCount, subs });
        }

        groups.sort((a, b) => b.total - a.total);
        const topGroups = groups.slice(0, 10);

        const pieLabels = [];
        const pieData = [];
        const backgroundColors = [];
        let colorIndex = 0;

        for (const group of topGroups) {
            const color = colors[colorIndex++ % colors.length];
            const mainUser = await interaction.client.users.fetch(group.mainId).catch(() => null);
            const mainName = mainUser ? mainUser.username : 'Unknown';
            pieLabels.push(mainName);
            pieData.push(group.mainCount);
            backgroundColors.push(color);

            for (const subId of group.subs) {
                const subUser = await interaction.client.users.fetch(subId).catch(() => null);
                const subName = subUser ? subUser.username : 'Unknown';
                pieLabels.push(`└ ${subName}`);
                pieData.push(countMap.get(subId) || 0);
                backgroundColors.push(color);
            }
        }

        const topMainIds = new Set(topGroups.map(g => g.mainId));
        let otherCount = 0;
        for (const group of groups) if (!topMainIds.has(group.mainId)) otherCount += group.total;
        if (otherCount > 0) {
            pieLabels.push('その他');
            pieData.push(otherCount);
            backgroundColors.push('#cccccc');
        }

        const totalCount = pieData.reduce((a, b) => a + b, 0);
        const pieDataPercent = pieData.map(v => Number(((v / totalCount) * 100).toFixed(2)));

        const configuration = {
            type: 'pie',
            data: { labels: pieLabels, datasets: [{ data: pieDataPercent, backgroundColor: backgroundColors }] },
            options: {
                responsive: false,
                plugins: {
                    datalabels: {
                        color: '#ffffff',
                        font: { weight: 'bold', size: 14 },
                        formatter: (value, context) => value < 3 ? '' : `${context.chart.data.labels[context.dataIndex]}\n${value}%`
                    }
                }
            },
            plugins: [ChartDataLabels]
        };

        const buffer = await chartCanvas.renderToBuffer(configuration);
        const attachment = new AttachmentBuilder(buffer, { name: `message_pie.png` });
        return interaction.editReply({ files: [attachment] });
    }
};