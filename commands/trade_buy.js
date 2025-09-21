import { SlashCommandBuilder } from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// __dirname を ESM で定義
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const coinsFile = path.join(__dirname, "../coins.json");
const INITIAL_PRICE = 950;

export const data = new SlashCommandBuilder()
  .setName("buy")
  .setDescription("株を購入します")
  .addIntegerOption(option =>
    option.setName("count")
      .setDescription("購入する株数")
      .setRequired(true)
  );

export async function execute(interaction, { client }) {
  const count = interaction.options.getInteger("count");
  if (count <= 0) return interaction.reply("❌ 購入数は1以上にしてください");

  const stockPrice = client.getStockPrice();
  const totalCost = stockPrice * count;
  const userCoins = client.getCoins(interaction.user.id);

  if (userCoins < totalCost) {
    return interaction.reply("❌ コインが足りません");
  }

  client.updateCoins(interaction.user.id, -totalCost);
  client.modifyStockByTrade("buy", count);

  interaction.reply(`✅ 株を ${count} 株購入しました（${totalCost} コイン消費）`);
}
