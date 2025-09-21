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
  .setName("sell")
  .setDescription("株を売却します")
  .addIntegerOption(option =>
    option.setName("count")
      .setDescription("売却する株数")
      .setRequired(true)
  );

export async function execute(interaction, { client }) {
  const count = interaction.options.getInteger("count");
  if (count <= 0) return interaction.reply("❌ 売却数は1以上にしてください");

  const stockPrice = client.getStockPrice();
  const totalGain = stockPrice * count;

  // 実際には「株の保有数」を管理していればチェックが必要
  // ここでは簡略化して売却可能と仮定
  client.updateCoins(interaction.user.id, totalGain);
  client.modifyStockByTrade("sell", count);

  interaction.reply(`✅ 株を ${count} 株売却しました（${totalGain} コイン獲得）`);
}
