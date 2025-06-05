const { REST, Routes } = require('discord.js');
const fs = require('fs');
const config = require('./config.json');

const commands = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if (command.data) {
        // SlashCommandBuilderの場合は直接コマンドオブジェクトをpush
        commands.push(command.data);
    } else {
        console.warn(`${file} は有効なスラッシュコマンド形式ではありません`);
    }
}

const rest = new REST({ version: '10' }).setToken(config.token);
const isGlobal = process.argv.includes('--global');
const route = isGlobal
    ? Routes.applicationCommands(config.clientId)
    : Routes.applicationGuildCommands(config.clientId, config.devGuildId);

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
