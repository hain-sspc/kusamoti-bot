const globalPath = './data/globalChannels.json';
const fs = require('fs');
const path = './data/globalChannels.json';
const dir = './data';



module.exports = {
    data: {
        name: 'setglobal',
        description: 'このチャンネルをグローバルチャットに設定します',
    },
    async execute(interaction) {
        const channelId = interaction.channel.id;
        const guildId = interaction.guild.id;

        // ディレクトリがなければ作成
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        let data = {};
        if (fs.existsSync(path)) {
            data = JSON.parse(fs.readFileSync(path));
        }

        // 現在のギルドのチャンネルIDを保存
        data[guildId] = channelId;

        // JSONファイルとして保存
        fs.writeFileSync(path, JSON.stringify(data, null, 2));

        await interaction.reply('このチャンネルをグローバルチャットに設定しました。');
    }
};
