const { SlashCommandBuilder } = require('discord.js');
const { loadGuildData } = require('../messageLogger');
const { createCanvas } = require('canvas');
const { spawn } = require('child_process');
const path = require('path');

const width = 800;
const height = 450;

const MINUTE = 60000;
const DAY = 24 * 60 * MINUTE;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('video')
        .setDescription('24時間スライディング・動的上位5人動画'),

    async execute(interaction) {
        try {
            await interaction.deferReply();

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
            const start = entries[0].time;

            const outputPath = path.join(process.cwd(), 'output.mp4');

            const ffmpeg = spawn('ffmpeg', [
                '-y',
                '-f', 'image2pipe',
                '-framerate', '24',
                '-i', '-',
                '-c:v', 'libx264',
                '-preset', 'veryfast',
                '-pix_fmt', 'yuv420p',
                outputPath
            ]);

            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            const windowCounts = new Map();
            let windowTotal = 0;

            // history構造変更
            const history = new Map();
            // uid => { data: [], active: false, fade: 1 }

            const userCache = new Map();

            const STEP = 10;
            let minuteIndex = 0;

            const padding = 50;
            const graphWidth = width - padding * 2;
            const graphHeight = height - padding * 2;

            const visibleFrames = 1440;

            const colorMap = new Map();
            const palette = ['#ff4757', '#1e90ff', '#2ed573', '#ffa502', '#a55eea', '#ff6b81', '#70a1ff'];
            function getColor(uid) {
                if (!colorMap.has(uid)) {
                    colorMap.set(uid, palette[colorMap.size % palette.length]);
                }
                return colorMap.get(uid);
            }

            // 初期24時間
            for (let t = start; t < start + DAY; t += MINUTE) {
                const d = minuteMap.get(t);
                if (!d) continue;
                windowTotal += d.total || 0;
                for (const [uid, c] of Object.entries(d.users || {})) {
                    windowCounts.set(uid, (windowCounts.get(uid) || 0) + c);
                }
            }

            const allUserIds = new Set();
            for (const d of entries) {
                for (const uid of Object.keys(d.data.users || {})) {
                    allUserIds.add(uid);
                }
            }

            for (const uid of allUserIds) {
                history.set(uid, { data: [], active: false, fade: 1 });
                try {
                    const user = await interaction.client.users.fetch(uid);
                    userCache.set(uid, user);
                } catch {
                    userCache.set(uid, { username: 'Unknown' });
                }
            }

            for (let current = start + DAY; current <= now; current += MINUTE) {

                const add = minuteMap.get(current);
                if (add) {
                    windowTotal += add.total || 0;
                    for (const [uid, c] of Object.entries(add.users || {})) {
                        windowCounts.set(uid, (windowCounts.get(uid) || 0) + c);
                    }
                }

                const rem = minuteMap.get(current - DAY);
                if (rem) {
                    windowTotal -= rem.total || 0;
                    for (const [uid, c] of Object.entries(rem.users || {})) {
                        const nv = (windowCounts.get(uid) || 0) - c;
                        if (nv <= 0) windowCounts.delete(uid);
                        else windowCounts.set(uid, nv);
                    }
                }

                minuteIndex++;
                if (minuteIndex % STEP !== 0) continue;

                // Top5
                const sorted = [...windowCounts.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);

                const topUsers = sorted.map(v => v[0]);

                // 履歴更新
                for (const uid of allUserIds) {
                    const obj = history.get(uid);
                    const percent = windowTotal > 0
                        ? (windowCounts.get(uid) || 0) / windowTotal * 100
                        : 0;

                    if (topUsers.includes(uid)) {
                        obj.active = true;
                        obj.fade = 1;
                        obj.data.push(percent);
                        if (obj.data.length > visibleFrames) obj.data.shift();
                    } else {
                        if (obj.active) {
                            obj.active = false;
                        }
                    }
                }

                // 全体最大
                let globalMaxPercent = 1;
                for (const obj of history.values()) {
                    for (const val of obj.data) {
                        if (val > globalMaxPercent) globalMaxPercent = val;
                    }
                }

                // 描画
                ctx.fillStyle = '#111';
                ctx.fillRect(0, 0, width, height);

                for (let i = 0; i <= 5; i++) {
                    const val = (globalMaxPercent / 5) * i;
                    const y = height - padding - (val / globalMaxPercent) * graphHeight;
                    ctx.strokeStyle = '#333';
                    ctx.beginPath();
                    ctx.moveTo(padding, y);
                    ctx.lineTo(width - padding, y);
                    ctx.stroke();
                    ctx.fillStyle = '#888';
                    ctx.textAlign = 'right';
                    ctx.fillText(`${val.toFixed(1)}%`, padding - 5, y);
                }

                for (const [uid, obj] of history.entries()) {

                    if (!obj.data.length) continue;

                    if (!obj.active) continue;

                    ctx.globalAlpha = obj.fade;

                    const color = getColor(uid);
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2;
                    ctx.beginPath();

                    for (let i = 0; i < obj.data.length; i++) {
                        const x = padding + graphWidth / 2 -
                            (obj.data.length - 1 - i) * (graphWidth / visibleFrames);
                        const y = height - padding -
                            (obj.data[i] / globalMaxPercent) * graphHeight;
                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }

                    ctx.stroke();

                    if (obj.active) {
                        const last = obj.data[obj.data.length - 1];
                        const x = padding + graphWidth / 2;
                        const y = height - padding -
                            (last / globalMaxPercent) * graphHeight;

                        ctx.beginPath();
                        ctx.arc(x, y, 10, 0, Math.PI * 2);
                        ctx.fillStyle = color;
                        ctx.fill();

                        ctx.fillStyle = '#fff';
                        ctx.font = '10px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(`${last.toFixed(1)}%`, x, y);

                        ctx.textAlign = 'left';
                        ctx.fillStyle = color;
                        ctx.font = '14px sans-serif';
                        ctx.fillText(
                            userCache.get(uid)?.username || 'Unknown',
                            x + 14, y
                        );
                    }

                    ctx.globalAlpha = 1;
                }

                ctx.fillStyle = '#aaa';
                ctx.textAlign = 'right';
                ctx.fillText(
                    new Date(current).toLocaleString('ja-JP'),
                    width - 20, 20
                );

                ffmpeg.stdin.write(canvas.toBuffer('image/jpeg'));
            }

            ffmpeg.stdin.end();
            await new Promise(res => ffmpeg.on('close', res));
            await interaction.editReply(`完了 保存先: ${outputPath}`);

        } catch (err) {
            console.error(err);
            await interaction.editReply('エラー発生');
        }
    }
};