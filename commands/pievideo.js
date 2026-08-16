const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const { loadGuildData } = require('../messageLogger');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
//const ChartDataLabels = require('chartjs-plugin-datalabels');
const { spawn } = require('child_process');

const width = 1000;
const height = 600;
const chartCanvas = new ChartJSNodeCanvas({ width, height });

const MINUTE = 60 * 1000;
const HOUR = 60 * 60 * 1000;

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('pievideo')
        .setDescription('円グラフ推移動画')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('期間')
                .addChoices(
                    { name: '24時間', value: '24' },
                    { name: '72時間', value: '72' }
                )
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const mode = interaction.options.getString('mode') || '72';
            const duration = mode === '24' ? 24 * HOUR : 72 * HOUR;

            const guildId = interaction.guild.id;
            const raw = loadGuildData(guildId);
            const logs = raw.logs;

            if (!logs) return interaction.editReply('データなし');

            const entries = Object.entries(logs)
                .filter(([k]) => k.includes('T'))
                .map(([k, v]) => ({
                    time: new Date(k + ':00+09:00').getTime(),
                    data: v
                }))
                .sort((a, b) => a.time - b.time);

            if (!entries.length) return interaction.editReply('ログ空');

            const minuteMap = new Map(entries.map(e => [e.time, e.data]));
            const now = Math.floor(Date.now() / MINUTE) * MINUTE;

            // サブアカ
            const SUB_PATH = path.join(__dirname, '../data/subAccounts.json');
            let subData = {};
            if (fs.existsSync(SUB_PATH)) {
                subData = JSON.parse(fs.readFileSync(SUB_PATH, 'utf8'));
            }
            const guildSubs = subData[guildId] || {};

            const subToMain = new Map();
            for (const mainId in guildSubs) {
                for (const subId of guildSubs[mainId]) {
                    subToMain.set(subId, mainId);
                }
            }

            // ユーザーキャッシュ
            const userCache = new Map();
            async function getUser(id) {
                if (!userCache.has(id)) {
                    const user = await interaction.client.users.fetch(id).catch(() => null);
                    userCache.set(id, user);
                }
                return userCache.get(id);
            }

            // ffmpeg
            const outputPath = path.join(__dirname, '..', `pie_${mode}h.mp4`);

            const ffmpeg = spawn('ffmpeg', [
                '-y',
                '-f', 'image2pipe',
                '-vcodec', 'mjpeg',
                '-framerate', '2',
                '-i', '-',
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                outputPath
            ]);

            ffmpeg.on('error', console.error);

            const colors = [
                '#ff6384', '#36a2eb', '#ffce56', '#4bc0c0',
                '#9966ff', '#ff9f40', '#8dd17e', '#d65db1'
            ];

            const step = HOUR;

            const totalFrames = Math.floor(duration / step);
            let frameCount = 0;

            let wroteFrame = false;

            for (let t = now - duration; t <= now; t += step) {

                frameCount++;

                // ===== 進捗 =====
                if (frameCount % 2 === 0) {
                    const percentProgress = ((frameCount / totalFrames) * 100).toFixed(1);
                    await interaction.editReply(`生成中... ${percentProgress}%`);
                }

                // ===== 集計 =====
                const counts = new Map();
                let total = 0;

                for (let tt = t - duration; tt <= t; tt += MINUTE) {
                    const data = minuteMap.get(tt);
                    if (!data) continue;

                    total += data.total || 0;
                    for (const [uid, c] of Object.entries(data.users || {})) {
                        counts.set(uid, (counts.get(uid) || 0) + c);
                    }
                }

                if (total === 0) continue;

                // ===== ランキング =====
                const finalCounts = [...counts.entries()].sort((a, b) => b[1] - a[1]);

                const top = finalCounts.slice(0, 10);
                const others = finalCounts.slice(10);

                // ===== データ作成 =====
                const labels = [];
                const dataArr = [];
                const bg = [];

                let colorIndex = 0;

                // Top10
                for (const [uid, count] of top) {
                    const color = colors[colorIndex++ % colors.length];

                    const user = await getUser(uid);
                    labels.push(user ? user.username : 'Unknown');
                    dataArr.push(count);
                    bg.push(color);
                }

                // その他
                let otherTotal = 0;
                for (const [, count] of others) {
                    otherTotal += count;
                }

                if (otherTotal > 0) {
                    labels.push('その他');
                    dataArr.push(otherTotal);
                    bg.push('#cccccc');
                }

                // %変換
                const sum = dataArr.reduce((a, b) => a + b, 0);
                if (sum === 0) continue;

                const percent = dataArr.map(v =>
                    Number(((v / sum) * 100).toFixed(2))
                );

                // ===== グラフ =====
                const config = {
                    type: 'pie',
                    data: {
                        labels,
                        datasets: [{
                            data: percent,
                            backgroundColor: bg
                        }]
                    },
                   
                };

                // ===== 描画＋テキスト =====
                const buffer = await chartCanvas.renderToBuffer(config, 'image/jpeg');

                const canvas = createCanvas(width, height);
                const ctx = canvas.getContext('2d');

                const img = await loadImage(buffer);
                ctx.drawImage(img, 0, 0);

                const centerX = width / 2;
                const centerY = height / 2;
                const radius = Math.min(width, height) * 0.45;

                let startAngle = -Math.PI / 2;

                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                for (let i = 0; i < percent.length; i++) {
                    const sliceAngle = (percent[i] / 100) * Math.PI * 2;
                    const midAngle = startAngle + sliceAngle / 2;

                    // ラベル位置（円の中）
                    const x = centerX + Math.cos(midAngle) * radius * 0.6;
                    const y = centerY + Math.sin(midAngle) * radius * 0.6;

                    // 小さすぎるのは表示しない
                    if (percent[i] >= 3) {
                        ctx.fillStyle = '#ffffff';
                        ctx.fillText(`${labels[i]}\n${percent[i]}%`, x, y);
                    }

                    startAngle += sliceAngle;

                    ffmpeg.stdin.write(canvas.toBuffer('image/jpeg'));
                    wroteFrame = true;
                }
            }

            ffmpeg.stdin.end();
            await new Promise(res => ffmpeg.on('close', res));

            if (!wroteFrame) {
                return interaction.editReply('データ不足で動画生成失敗');
            }

            await interaction.editReply({
                content: '動画完成'
            });

        } catch (err) {
            console.error(err);

      

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply('エラー発生');
            } else {
                await interaction.reply('エラー発生');
            }
        }
    }
};