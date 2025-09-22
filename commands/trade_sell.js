import { SlashCommandBuilder } from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stocksFile = path.join(__dirname, "../stocks.json");

function loadStocks() {
  if (!fs.existsSync(stocksFile)) fs.writeFileSync(stocksFile, JSON.stringify({}));
  const raw = JSON.parse(fs.readFileSync(stocksFile, "utf-8"));
  return new Map(Object.entries(raw));
}

function saveStocks(map) {
  const obj = Object.fromEntries(map);
  fs.writeFileSync(stocksFile, JSON.stringify(obj, null, 2));
}

export const data = new SlashCommandBuilder()
  .setName("sell")
  .setDescription("株を売却します")
  .addIntegerOption(opt =>
    opt.setName("count")
      .setDescription("売却する株数")
      .setRequired(true)
  );

export async function execute(interaction, { client }) {
  const count = interaction.options.getInteger("count");
  if (count <= 0) return interaction.reply({ content: "❌ 売却数は1以上にしてください", flags: 64 });

  const stocks = loadStocks();
  const userStock = stocks.get(interaction.user.id) || 0;

  if (userStock < count) {
    return interaction.reply({ content: `❌ 売却できる株が不足しています\n現在の保有株数: ${userStock} 株`, flags: 64 });
  }

  const stockPrice = client.getStockPrice();
  const totalGain = stockPrice * count;

  // コインを増やす
  client.updateCoins(interaction.user.id, totalGain);

  // 株価変動
  client.modifyStockByTrade("sell", count);

  // 株数減らす
  stocks.set(interaction.user.id, userStock - count);
  saveStocks(stocks);

  interaction.reply(
    `✅ 株を ${count} 株売却しました（${totalGain} コイン獲得）\n` +
    `現在の保有株数: ${userStock - count} 株`
  );
}
