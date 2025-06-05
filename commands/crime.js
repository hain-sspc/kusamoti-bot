const { SlashCommandBuilder } = require('discord.js');
const { loadEconomy, saveEconomy } = require('../economy');

// 成功したときの犯罪
const successCrimes = [
    '銀行の裏口から侵入して現金をゲットした',
    '宝くじの番号を未来から入手して大当たり',
    '闇市でレアカードを売って荒稼ぎ',
    'UFOキャッチャーを操作して限定ぬいぐるみを大量ゲット',
    '市長の財布をスリ取って中身だけゲット',
    '競馬の八百長を仕込んで大勝利',
    '廃工場に隠された金庫を発見して開けた'
];

// 失敗したときの犯罪
const failCrimes = [
    '図書館で本に落書きして転売しようとしたが通報された',
    'コンビニの梅干しを全部なめて出禁にされた',
    'ATMにペットボトルのキャップを突っ込んで捕まった',
    '焼きそばパンを横取りしようとしたら先生に見つかった',
    'ドローンでスイカを盗もうとしたら木に引っかかった',
    '税金返してデモで逆に寄付を求められた',
    'ゲームセンターでUFOキャッチャーを手で操作して監視カメラに映った'
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('犯罪に手を染めて一攫千金！？ 成功すれば報酬、失敗すれば罰金…'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const eco = loadEconomy();
        const user = eco.guilds?.[guildId]?.users?.[userId];

        if (!user) {
            return interaction.reply('ユーザーデータが見つかりませんでした。');
        }

        const success = Math.random() < 0.5;

        if (success) {
            const crime = successCrimes[Math.floor(Math.random() * successCrimes.length)];
            const reward = Math.floor(1000 + Math.random() * 9001);
            user.balance += reward;
            saveEconomy(eco);
            return interaction.reply(`✅ **成功！** ${crime}。\n💰 ${reward} コインを手に入れた！`);
        } else {
            const crime = failCrimes[Math.floor(Math.random() * failCrimes.length)];
            const fine = Math.floor(1000 + Math.random() * 9001);
            user.balance = Math.max(0, user.balance - fine);
            saveEconomy(eco);
            return interaction.reply(`🚨 **失敗！** ${crime}。\n💸 ${fine} コインの罰金を支払った…`);
        }
    }
};
