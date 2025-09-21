import { SlashCommandBuilder } from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// __dirname を ESM で定義
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const coinsFile = path.join(__dirname, "../coins.json");

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
  if (count <= 0) return interaction.reply({ content: "❌ 購入数は1以上にしてください", flags: 64 });

  const stockPrice = client.getStockPrice();
  const totalCost = stockPrice * count;
  const userCoins = client.getCoins(interaction.user.id);

  if (userCoins < totalCost) {
    return interaction.reply({ content: "❌ コインが足りません", flags: 64 });
  }

  // コインを減らす
  client.updateCoins(interaction.user.id, -totalCost);

  // 株価変動
  client.modifyStockByTrade("buy", count);

  // ユーザー株保有数を更新
  const userData = client.coins.get(interaction.user.id) || { coins: 0, stocks: 0 };
  userData.stocks = (userData.stocks || 0) + count;
  client.coins.set(interaction.user.id, userData);

  // coins.json 保存
  fs.writeFileSync(coinsFile, JSON.stringify(Object.fromEntries(client.coins), null, 2));

  interaction.reply(`✅ 株を ${count} 株購入しました（${totalCost} コイン消費）\n現在の保有株数: ${userData.stocks} 株`);
}
