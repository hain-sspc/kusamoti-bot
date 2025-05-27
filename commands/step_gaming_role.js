const { SlashCommandBuilder, GatewayIntentBits } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config.json');

const filePath = path.join(__dirname, '..', 'data/gamingRoleSettings.json');

let hue = 0;
const colorInterval = 10000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('step_gaming_role')
        .setDescription('ゲーミングロールを設定＆虹色化します')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('虹色にするロール')
                .setRequired(false) // 任意にして、なければ config から使う
        ),

    async execute(interaction) {
        const roleOption = interaction.options.getRole('role');
        const guild = interaction.guild;
        const guildId = guild.id;

        let roleId = roleOption ? roleOption.id : config.ROLE_ID;
        if (!roleId) {
            return await interaction.reply('❌ ロールが指定されておらず、config.jsonにもROLE_IDが定義されていません。');
        }

        // 保存
        let settings = {};
        try {
            const json = await fs.readFile(filePath, 'utf8');
            settings = JSON.parse(json);
        } catch {
            settings = {};
        }

        settings[guildId] = {
            roleId,
            enabled: true
        };

        try {
            await fs.writeFile(filePath, JSON.stringify(settings, null, 2), 'utf8');
            await interaction.reply(`ロール <@&${roleId}> をゲーミングロールとして保存＆虹色変化を開始します。`);
        } catch (err) {
            console.error('書き込みエラー:', err);
            return await interaction.reply('JSONファイルへの書き込みに失敗しました。');
        }

        // 虹色ループ開始
        const targetRole = guild.roles.cache.get(roleId);
        if (!targetRole) {
            return console.error("ロールが見つかりません:", roleId);
        }

        setInterval(async () => {
            const color = hsvToHex(hue, 1, 1);
            hue = (hue + 10) % 360;

            try {
                await targetRole.edit({ color });
                console.log(`[${guild.name}] ロールの色変更: ${color}`);
            } catch (err) {
                console.error("ロールの色変更に失敗:", err);
            }
        }, colorInterval);
    }
};

// HSV → HEX 変換
function hsvToHex(h, s, v) {
    const f = (n, k = (n + h / 60) % 6) =>
        v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
    const r = Math.round(f(5) * 255);
    const g = Math.round(f(3) * 255);
    const b = Math.round(f(1) * 255);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
