const { Client, GatewayIntentBits, Collection, Partials, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./data/config.json');

const { messageLogger } = require('./messageLogger');


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Message, Partials.Channel]
});

client.commands = new Collection();


const commandsPath = path.join(__dirname, './commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);

    if (!command?.data?.name) {
        console.warn(` ${file} は正しい形式ではありません。スキップします。`);
        continue;
    }

    client.commands.set(command.data.name, command);
}



const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

console.log("読み込むイベント:", eventFiles);

for (const file of eventFiles) {

    console.log("イベント読み込み:", file);

    const event = require(`./events/${file}`);

    console.log("event.name =", event.name);

    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
}


const { antinuke } = require('./antinuke');
antinuke(client);

client.login(config.token);




messageLogger(client)



