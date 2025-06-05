const { Client, GatewayIntentBits, Collection, Events, EmbedBuilder, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const config = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel]
});

client.commands = new Collection();
const globalPath = path.join(__dirname, 'data/globalchat.json');

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const event = require(`./events/${file}`);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

// 🔧 絵文字追加対象チャンネルID
const TARGET_CHANNEL_ID = '1378161102281638089';
const EMOJI_SIZE = 128;
const MAX_SIZE = 256 * 1024;

// 🔄 スラッシュコマンド読み込み
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
}

// 🌱 草餅語録フレーズ対応
const phraseResponses = [
    { keywords: ['草餅過激派'], response: '草餅事変の実現！' },
    { keywords: ['草餅最強'], response: 'SSPConTOP' },
    { keywords: ['草餅派'], response: 'みんな草餅至上主義になろうね😅' },
    { keywords: ['バナナ', 'アスパラ', '黄'], response: '黄色いアスパラはバナナ' },
    { keywords: ['うん'], response: 'うんつゆあんあ' },
    {
        keywords: ['つまら', '過疎'],
        response: 'こんなつまらないサーバー抜けて草餅過激派になろうね😅\nいつでも歓迎、草餅派閥。'
    },
    { keywords: ['わかる', '分かる'], response: '分かります笑' },
    { keywords: ['草'], response: '草餅生える' },
    { keywords: ['長野', 'ながの'], response: 'ながのめあ' },
    { keywords: ['助'], response: 'たすかっと' },
];

// ✅ Bot準備完了
client.once(Events.ClientReady, () => {
    console.log(`✅ ログイン成功: ${client.user.tag}`);
});

// 🧠 スラッシュコマンド処理
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        if (!interaction.replied) {
            await interaction.reply({ content: '⚠ コマンド実行エラー。', ephemeral: true });
        } else {
            await interaction.editReply({ content: '⚠ エラーが発生しました。', ephemeral: true });
        }
    }
});

// 💬 メッセージ受信時処理
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    // phraseResponsesを長いキーワード優先でソート
    const sortedResponses = phraseResponses.slice().sort((a, b) => {
        const aLen = a.keywords.reduce((max, kw) => Math.max(max, kw.length), 0);
        const bLen = b.keywords.reduce((max, kw) => Math.max(max, kw.length), 0);
        return bLen - aLen; // 長いキーワードを優先
    });

    const content = message.content;

    for (const entry of sortedResponses) {
        for (const keyword of entry.keywords) {
            if (content.includes(keyword)) {
                await message.channel.send(entry.response);
                return; // 一つだけ反応したら抜ける
            }
        }
    }

    // 🎨 添付画像 → 絵文字として追加（特定チャンネル）
    if (message.channel.id === TARGET_CHANNEL_ID && message.attachments.size > 0) {
        for (const attachment of message.attachments.values()) {
            if (!attachment.contentType?.startsWith('image/')) continue;
            try {
                const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
                const buffer = Buffer.from(response.data);

                const resizedImage = await sharp(buffer)
                    .resize(EMOJI_SIZE, EMOJI_SIZE)
                    .png()
                    .toBuffer();

                const emojiName = path.parse(attachment.name).name.replace(/[^a-zA-Z0-9_]/g, '') || `emoji_${Date.now()}`;
                const emoji = await message.guild.emojis.create({ name: emojiName, attachment: resizedImage });

                await message.reply(`✅ 絵文字「:${emoji.name}:」として追加しました！`);
            } catch (err) {
                console.error('❌ 絵文字追加エラー:', err);
                await message.reply('⚠ 絵文字の追加に失敗しました。画像が大きすぎるか、無効な形式です。');
            }
        }
    }

    // 🌐 グローバルチャット送信
    if (!fs.existsSync(globalPath)) return;

    const data = JSON.parse(fs.readFileSync(globalPath, 'utf-8'));
    const thisChannelId = message.channel.id;
    const isGlobal = Object.values(data).some(entry => entry.channel_id === thisChannelId);
    if (!isGlobal) return;

    let contentText = `${message.content || ''}`.replace(/@everyone/g, '').replace(/@here/g, '').trim();
    const imageEmbeds = [];

    if (message.attachments.size > 0) {
        for (const attachment of message.attachments.values()) {
            if (attachment.contentType?.startsWith("image")) {
                imageEmbeds.push(new EmbedBuilder().setImage(attachment.url).setColor(0x00bfff).toJSON());
            } else {
                contentText += `\n${attachment.url}`;
            }
        }
    }

    const mainEmbed = new EmbedBuilder()
        .setDescription(contentText || '（メッセージなし）')
        .setColor(0x00bfff)
        .setTimestamp()
        .setFooter({ text: message.guild.name });

    const embedsToSend = [mainEmbed.toJSON(), ...imageEmbeds];

    for (const [guildId, entry] of Object.entries(data)) {
        if (entry.channel_id === thisChannelId) continue;
        try {
            await axios.post(entry.webhook_url, {
                username: message.author.username,
                avatar_url: message.author.displayAvatarURL({ dynamic: true }),
                embeds: embedsToSend
            });
        } catch (err) {
            console.error(`🌐 グローバル送信失敗 (${guildId}): ${err.message}`);
        }
    }
});

// 🔑 Botログイン
client.login(config.token);
