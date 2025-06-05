const { Client, GatewayIntentBits, ChannelType, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.once('ready', () => {
    console.log(`ログイン成功: ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (message.content === '!backup' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {

    }

    if (!message.content.startsWith('!restore') || !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    const args = message.content.trim().split(/\s+/);
    const backupGuildId = args[1];
    if (!backupGuildId) return message.reply('使用方法: `!restore <backupGuildId>`');

    const backupDir = path.join(__dirname, 'backup', backupGuildId);
    if (!fs.existsSync(backupDir)) {
        return message.reply(`バックアップフォルダが見つかりません: ${backupDir}`);
    }

    const backupFiles = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));
    if (backupFiles.length === 0) {
        return message.reply('バックアップファイルがありません。');
    }

    message.channel.send(`復元を開始します（バックアップ元サーバーID: ${backupGuildId}）...`);

    for (const file of backupFiles) {
        try {
         
            const [channelName, channelId] = file.replace('.json', '').split('_');

            let restoreChannel = message.guild.channels.cache.find(c => c.name === channelName && c.type === ChannelType.GuildText);

            if (!restoreChannel) {
                restoreChannel = await message.guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    reason: 'バックアップ復元のためのチャンネル作成',
                });
                await message.channel.send(`新しいチャンネルを作成しました: <#${restoreChannel.id}>`);
            }

            const messages = JSON.parse(fs.readFileSync(path.join(backupDir, file), 'utf8'));

           
            for (const msg of messages) {
                try {
                    await restoreChannel.send(`[${msg.author}] ${msg.content}`);
                    
                    await new Promise(r => setTimeout(r, 500));
                } catch (err) {
                    console.error(`メッセージ送信失敗 in ${restoreChannel.name}:`, err);
                }
            }
        } catch (err) {
            console.error('復元中にエラー発生:', err);
        }
    }

    message.channel.send("復元が完了しました。");
});

client.login(config.token);
