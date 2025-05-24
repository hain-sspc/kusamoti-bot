const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('./config.json');

const globalPath = path.join(__dirname, 'globalchat.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();

// コマンド読み込み（再追加）
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
}

// Bot起動時の処理
client.once(Events.ClientReady, () => {
    console.log(`✅ ログイン成功: ${client.user.tag}`);
});

// コマンド実行時の処理
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    console.log('→ 実行されたコマンド名:', interaction.commandName);
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        if (!interaction.replied) {
            await interaction.reply({ content: 'コマンド実行中にエラーが発生しました。', ephemeral: true });
        } else {
            await interaction.editReply({ content: 'エラーが発生しました。', ephemeral: true });
        }
    }
});

// メッセージ受信時のグローバルチャット処理
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (!fs.existsSync(globalPath)) return;

    const data = JSON.parse(fs.readFileSync(globalPath, 'utf-8'));
    const thisChannelId = message.channel.id;

    // このチャンネルがグローバルチャット対象か確認
    const isGlobal = Object.values(data).some(entry => entry.channel_id === thisChannelId);
    if (!isGlobal) return;

    // メッセージ内容作成（@everyone と @here を削除）
    let content = `${message.content || ''}`
        .replace(/@everyone/g, '')
        .replace(/@here/g, '')
        .trim();

    const files = [];

    // 添付ファイル（画像）を埋め込み用に収集
    if (message.attachments.size > 0) {
        for (const attachment of message.attachments.values()) {
            if (attachment.contentType?.startsWith("image")) {
                files.push(attachment.url);
            } else {
                content += `\n${attachment.url}`;
            }
        }
    }

    // 他のチャンネルにWebhook送信
    for (const [guildId, entry] of Object.entries(data)) {
        if (entry.channel_id === thisChannelId) continue;

        try {
            await axios.post(entry.webhook_url, {
                content: content,
                username: message.author.username,
                avatar_url: message.author.displayAvatarURL({ dynamic: true }),
                embeds: files.length > 0 ? files.map(url => ({ image: { url } })) : undefined
            });
        } catch (err) {
            console.error(`グローバル送信失敗 (${guildId}): ${err.message}`);
        }
    }
});

client.login(config.token);
