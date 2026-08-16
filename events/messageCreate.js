const { Events, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { minuteBuffer } = require('../messageLogger');

module.exports = {
    name: Events.MessageCreate,

    async execute(message, client) {

        if (message.author.bot) return;

        const guildId = message.guild?.id;
        if (!guildId) return;

        const userId = message.author.id;

        minuteBuffer[guildId] ??= {
            total: 0,
            users: {}
        };

        minuteBuffer[guildId].users[userId] =
            (minuteBuffer[guildId].users[userId] || 0) + 1;

        minuteBuffer[guildId].total++;
    }
};