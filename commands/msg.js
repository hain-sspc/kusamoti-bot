const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { loadGuildData, saveGuildData } = require("../messageLogger");

function addMessageCount(raw, guildId, userId, count) {
    const minuteKey = new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM

    raw.logs ??= {};
    raw.logs[minuteKey] ??= { total: 0, users: {} };
    raw.logs[minuteKey].users[userId] ??= 0;

    raw.logs[minuteKey].users[userId] += count;
    raw.logs[minuteKey].total += count;

    saveGuildData(guildId, raw); // messageLogger 側で用意した保存関数
}

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName("sendmsgcount")
        .setDescription("自分のメッセージ数を他のユーザーに送信")
        .addIntegerOption(option =>
            option.setName("count")
                .setDescription("送るメッセージ数")
                .setRequired(true)
                .setMinValue(1)
        )
        .addUserOption(option =>
            option.setName("user")
                .setDescription("送信先ユーザー")
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!["1330438210504884225", "1409536384586354698"].includes(interaction.user.id)) {
            return interaction.reply("うんつゆあんあ");
        }

        const count = interaction.options.getInteger("count");
        const receiver = interaction.options.getUser("user");
        const guildId = interaction.guild.id;

        const raw = loadGuildData(guildId);
        const senderId = interaction.user.id;

        // 送信者から減らす
        addMessageCount(raw, guildId, senderId, -count);

        // 受信者に加算
        addMessageCount(raw, guildId, receiver.id, count);

        const embed = new EmbedBuilder()
            .setTitle("メッセージ数送信")
            .setColor(0x00bfff)
            .addFields(
                { name: "送信者", value: `<@${senderId}>`, inline: true },
                { name: "受信者", value: `<@${receiver.id}>`, inline: true },
                { name: "送信数", value: `${count}`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};