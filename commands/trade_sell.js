import { SlashCommandBuilder } from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// __dirname を ESM で定義
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const coinsFile = path.join(__dirname, "../coins.json");

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
  if (count <= 0) return interaction.reply({ content: "❌ 売却数は1以上にしてください", flags: 64 });

  const userData = client.coins.get(interaction.user.id) || { coins: 0, stocks: 0 };

  if ((userData.stocks || 0) < count) {
    return interaction.reply({ content: `❌ 売却できる株が不足しています\n現在の保有株数: ${userData.stocks || 0} 株`, flags: 64 });
  }

  const stockPrice = client.getStockPrice();
  const totalGain = stockPrice * count;

  // コインを増やす
  client.updateCoins(interaction.user.id, totalGain);

  // 株価変動
  client.modifyStockByTrade("sell", count);

  // 株保有数を減らす
  userData.stocks -= count;
  client.coins.set(interaction.user.id, userData);

  // coins.json 保存
  fs.writeFileSync(coinsFile, JSON.stringify(Object.fromEntries(client.coins), null, 2));

  interaction.reply(`✅ 株を ${count} 株売却しました（${totalGain} コイン獲得）\n現在の保有株数: ${userData.stocks} 株`);
}
