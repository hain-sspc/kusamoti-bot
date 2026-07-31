const { REST, Routes } = require('discord.js');
const fs = require('fs');
const config = require('./config.json')
const dev = process.argv.includes('--dev')
const token1 = config.token
const token2 = config.token2
const clientId1 = config.clientId 
const clientId2 = config.clientId2
const token = dev ? token2 : token1
const clientId = dev ? clientId2 : clientId1
const commands = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);

    // devOnly: true のコマンドを --dev 以外で除外
    if (command.devOnly && !dev) {
        console.log(`スキップ: ${file} は開発用コマンドです (--dev 指定時のみ登録)`);
        continue;
    }

    if (command.data) {

        const name = command.data.name;

        console.log(`読み込み: ${file} → ${name}`);

        // 重複チェック
        const duplicate = commands.find(cmd => cmd.name === name);
        if (duplicate) {
            console.error(`❌ 重複コマンド検出: ${name} (${file})`);
        }

        commands.push(command.data);

    } else {
        console.warn(`${file} は有効なスラッシュコマンド形式ではありません`);
    }
}
const rest = new REST({ version: '10' }).setToken(token);
const isGlobal = process.argv.includes('--global');
const route = isGlobal
    ? Routes.applicationCommands(clientId)
    : Routes.applicationGuildCommands(clientId, config.devGuildId);

(async () => {
    try {
        console.log(`コマンドを ${isGlobal ? 'グローバル' : '開発サーバー'} に登録中...`);
        console.log('登録コマンド一覧:', commands.map(cmd => cmd.name).join(', '));

        await rest.put(route, { body: commands });

        console.log('コマンド登録完了！');
    } catch (error) {
        console.error('登録エラー:', error);
    }
})();
