const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const globalPath = path.join(__dirname, '../data/globalchat.json');

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('remove-globalchat')
        .setDescription('グローバルチャットを削除します')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        let data = {};
        if (fs.existsSync(globalPath)) {
            try {
                data = JSON.parse(fs.readFileSync(globalPath, 'utf-8'));
            } catch (err) {
                console.error('JSON読み込みエラー:', err);
                return await interaction.editReply({ content: '設定ファイルの読み込み中にエラーが発生しました。' });
            }
        }

        const guildId = interaction.guild.id;

        if (!data[guildId]) {
            return await interaction.editReply({ content: 'このサーバーはグローバルチャットに登録されていません。' });
        }

        // 削除
        delete data[guildId];
        try {
            fs.writeFileSync(globalPath, JSON.stringify(data, null, 2), 'utf-8');
            await interaction.editReply({ content: `このサーバーのグローバルチャット設定を削除しました。` });
        } catch (err) {
            console.error('JSON書き込みエラー:', err);
            await interaction.editReply({ content: '設定ファイルの保存中にエラーが発生しました。' });
        }
    },
};
