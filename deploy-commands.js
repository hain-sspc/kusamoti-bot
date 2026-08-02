const { REST, Routes } = require('discord.js');
const fs = require('fs');
const config = require('./data/config.json');
const dev = process.argv.includes('--dev')
const token = config.token
const clientId = config.clientId
const commands = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);

 
    if (command.devOnly && !dev) {
        console.log(`スキップ: ${file} は開発用コマンドです`);
        continue;
    }

    if (command.data) {

        const name = command.data.name;

        console.log(`読み込み: ${file} → ${name}`);

      
        const duplicate = commands.find(cmd => cmd.name === name);
        if (duplicate) {
            console.error(`重複コマンド検出: ${name} (${file})`);
        }

        commands.push(command.data);

    } else {
        console.warn(`${file} は有効なスラッシュコマンド形式ではありません`);
    }
}
const rest = new REST({ version: '10' }).setToken(token);
const route = dev
    ? Routes.applicationGuildCommands(clientId, config.devGuildId)
    : Routes.applicationCommands(clientId);
        

(async () => {
    try {
        console.log(`コマンドを ${dev ? '開発サーバー' : 'グローバル'} に登録中...`);
        console.log('登録コマンド一覧:', commands.map(cmd => cmd.name).join(', '));

        await rest.put(route, { body: commands });

        console.log('コマンド登録完了！');
    } catch (error) {
        console.error('登録エラー:', error);
    }
})();
