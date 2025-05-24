const { Client, GatewayIntentBits } = require("discord.js");
const config = require("./config.json");
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const TARGET_ROLE_ID = "ROLE_ID";
let hue = 0;

client.once("ready", () => {
   
    setInterval(async () => {
        const guild = client.guilds.cache.first(); // 複数サーバー対応するなら変更
        if (!guild) return;

        const role = guild.roles.cache.get(TARGET_ROLE_ID);
        if (!role) return;

        // HSV → RGB に変換してカラーコードを生成
        const color = hsvToHex(hue, 1, 1);
        hue = (hue + 10) % 360;

        try {
            await role.edit({ color });
            console.log(`ロールカラー変更: ${color}`);
        } catch (err) {
            console.error("ロールの色変更に失敗:", err);
        }
    }, 10000); // 10秒ごとに変化
});

// HSV → HEX（16進）変換関数
function hsvToHex(h, s, v) {
    const f = (n, k = (n + h / 60) % 6) =>
        v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
    const r = Math.round(f(5) * 255);
    const g = Math.round(f(3) * 255);
    const b = Math.round(f(1) * 255);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

client.login(token);