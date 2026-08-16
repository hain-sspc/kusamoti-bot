const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const fs = require('fs');
const SUB_PATH = './data/sub.json';

function loadSubData() {
    if (!fs.existsSync(SUB_PATH)) {
        fs.writeFileSync(SUB_PATH, JSON.stringify({ subAccounts: {}, pending: {} }, null, 2));
    }

    try {
        const raw = fs.readFileSync(SUB_PATH, 'utf8').trim();
        if (!raw) {
            const initial = { subAccounts: {}, pending: {} };
            fs.writeFileSync(SUB_PATH, JSON.stringify(initial, null, 2));
            return initial;
        }
        return JSON.parse(raw);
    } catch (err) {
        console.error('sub.json の読み込みに失敗しました。初期化します:', err);
        const initial = { subAccounts: {}, pending: {} };
        fs.writeFileSync(SUB_PATH, JSON.stringify(initial, null, 2));
        return initial;
    }
}

function saveSubData(data) {
    fs.writeFileSync(SUB_PATH, JSON.stringify(data, null, 2));
}

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName('registersub')
        .setDescription('サブ垢を本垢に登録申請する')
        .addUserOption(option =>
            option.setName('main')
                .setDescription('本垢ユーザーを指定')
                .setRequired(true)),
    async execute(interaction) {
        const subId = interaction.user.id;
        const mainUser = interaction.options.getUser('main');
        const mainId = mainUser.id;

        const subData = loadSubData();

        // まず deferReply
        await interaction.deferReply({ ephemeral: true });

        let message = '';

        // 状態チェック
        if (subData.subAccounts[subId]) {
            message = 'このサブ垢は既に登録済みです。';
        } else if (subData.pending[subId]) {
            message = 'このサブ垢は既に承認待ちです。';
        } else {
            // 登録処理
            subData.pending[subId] = mainId;
            saveSubData(subData);

            const approveButton = new ButtonBuilder()
                .setCustomId(`approveSub_${subId}`)
                .setLabel('承認する')
                .setStyle(ButtonStyle.Success);
            const row = new ActionRowBuilder().addComponents(approveButton);

            try {
                await mainUser.send({
                    content: `📩 ${interaction.user.tag} があなたの口座にサブ垢登録を申請しました。`,
                    components: [row]
                });
                message = '本垢に承認依頼を送信しました。DM を確認してください。';
            } catch (err) {
                console.error('DM送信エラー:', err);
                message = '本垢に DM を送信できませんでした。DM 設定を確認してください。';
            }
        }

        // deferReply 後は必ず editReply
        await interaction.editReply({ content: message });
    }
,

    loadSubData,
    saveSubData
};
