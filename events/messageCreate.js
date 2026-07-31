
const { Events, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');



module.exports = {
    name: Events.MessageCreate,
    async execute(message, client) {

        if (message.author.bot) return;

        const guildId = message.guild?.id;
        if (!guildId) return;



    }
};