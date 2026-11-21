const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const io = require("../systems/io");

const SHOP_PATH = path.join(__dirname, "../data/shop.json");

function loadShop() {
    if (!fs.existsSync(SHOP_PATH)) return [];
    let raw = fs.readFileSync(SHOP_PATH, "utf8");
    raw = raw.replace(/^\uFEFF/, "");
    return JSON.parse(raw);
}

function saveShop(shop) {
    io.writeJsonSync(SHOP_PATH, shop);
}

module.exports = {
     devOnly: true,
    data: new SlashCommandBuilder()
        .setName("restock")
        .setDescription("新しい商品を仕入れます"),

    async execute(interaction) {
        // モーダル作成
        const modal = new ModalBuilder()
            .setCustomId("additemModal")
            .setTitle("新しい商品を仕入れる");

        // 各入力欄
        const nameInput = new TextInputBuilder()
            .setCustomId("name")
            .setLabel("商品名")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const priceInput = new TextInputBuilder()
            .setCustomId("price")
            .setLabel("価格")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const stockInput = new TextInputBuilder()
            .setCustomId("stock")
            .setLabel("在庫数")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const textInput = new TextInputBuilder()
            .setCustomId("text")
            .setLabel("説明文")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(priceInput),
            new ActionRowBuilder().addComponents(stockInput),
            new ActionRowBuilder().addComponents(textInput)
        );

        // モーダル表示
        await interaction.showModal(modal);
    }
};