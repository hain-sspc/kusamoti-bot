const { Events, EmbedBuilder, RoleSelectMenuBuilder, tringSelectMenuBuilder, Partials, WebhookClient, ActionRowBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, ChannelType, PermissionFlagsBits, ActivityType } = require('discord.js');
const { } = require('../systems/economy');
const fs = require('fs');
const path = require('path');




module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        if (!interaction.isChatInputCommand()) return;
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            if (
                interaction.commandName === 'ai-analysis' &&
                !interaction.deferred &&
                !interaction.replied
            ) {
                const arrivalDelay = Date.now() - interaction.createdTimestamp;
                console.log(
                    `[INTERACTION ACK] /ai-analysis gatewayDelay=${arrivalDelay}ms`
                );
                await interaction.deferReply({ ephemeral: true });
            }

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
            if (error.code === 10062) {
                console.warn(
                    `Interactionの応答期限が切れました: /${interaction.commandName} ` +
                    `(${interaction.id}), gatewayDelay=` +
                    `${Date.now() - interaction.createdTimestamp}ms`
                );
                return;
            }

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content: 'エラー',
                    components: [],
                    embeds: []
                }).catch(replyError => {
                    console.error('Interactionへのエラー返信に失敗しました:', replyError);
                });
            } else {
                await interaction.reply({ content: 'エラー', ephemeral: true }).catch(replyError => {
                    console.error('Interactionへのエラー返信に失敗しました:', replyError);
                });
            }
        }
    }
}