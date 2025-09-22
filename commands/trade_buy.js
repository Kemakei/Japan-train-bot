import { SlashCommandBuilder } from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stocksFile = path.join(__dirname, "../stocks.json");

// 永続化用ヘルパー
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
  .setName("buy")
  .setDescription("株を購入します")
  .addIntegerOption(opt =>
    opt.setName("count")
      .setDescription("購入する株数")
      .setRequired(true)
  );

export async function execute(interaction, { client }) {
  const count = interaction.options.getInteger("count");
  if (count <= 0) return interaction.reply({ content: "❌ 購入数は1以上にしてください", flags: 64 });

  const stockPrice = client.getStockPrice();
  const totalCost = stockPrice * count;
  const fee = Math.floor(totalCost * 0.2) + 100;
  const totalPayment = totalCost + fee;

  const userCoins = client.getCoins(interaction.user.id);
  if (userCoins < totalPayment) {
    return interaction.reply({ content: `❌ コインが足りません\n必要コイン: ${totalPayment}（購入額: ${totalCost} + 手数料: ${fee}）`, flags: 64 });
  }

  // コインを減らす
  client.updateCoins(interaction.user.id, -totalPayment);

  // 株価変動
  client.modifyStockByTrade("buy", count);

  // 株数更新
  const stocks = loadStocks();
  const prevStock = stocks.get(interaction.user.id) || 0;
  stocks.set(interaction.user.id, prevStock + count);
  saveStocks(stocks);

  interaction.reply(
    `✅ 株を ${count} 株購入しました\n` +
    `購入額: ${totalCost} コイン\n手数料: ${fee} コイン\n合計支払い: ${totalPayment} コイン\n` +
    `現在の保有株数: ${prevStock + count} 株`
  );
}
