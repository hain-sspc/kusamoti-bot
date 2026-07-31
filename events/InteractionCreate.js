const { Events, EmbedBuilder, RoleSelectMenuBuilder, tringSelectMenuBuilder, Partials, WebhookClient, ActionRowBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, ChannelType, PermissionFlagsBits, ActivityType } = require('discord.js');
const { } = require('../systems/economy');
const fs = require('fs');
const path = require('path');




module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        console.log("interactionイベント発火");
        console.log("interaction受信:", interaction.commandName);
       
  
      
        if (!interaction.isChatInputCommand()) return;
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);

        
            try {
                const channel = await client.channels.fetch(logchannelid);
                await channel.send(`${interaction.user.tag} が /${interaction.commandName} を実行しました`);
                console.log(`[INTERACTION] ${interaction.commandName} 実行`);
                console.log(`[USER] ${interaction.user.tag} (${interaction.user.id})`);
            } catch (e) {
                console.error("ログ送信失敗:", e.message);
            }
        } catch (error) {
            console.error(error);
            if (!interaction.replied) {
                await interaction.reply({ content: 'エラー', ephemeral: true });
            } else {
                await interaction.editReply({ content: 'エラー', ephemeral: true });
            }
        }
    }
}