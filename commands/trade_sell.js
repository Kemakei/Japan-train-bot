// commands/trade_sell.js
import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("trade_sell")
  .setDescription("株を売却します")
  .addIntegerOption(opt =>
    opt.setName("count")
      .setDescription("売却する株数")
      .setRequired(true)
  );

export async function execute(interaction, { client }) {
  const userId = interaction.user.id;
  const count = interaction.options.getInteger("count");

  if (count < 1) {
    return interaction.reply({ content: "売却株数が不正です", flags: 64 });
  }

  const userData = client.coins.get(userId) || { coins: 0, stock: 0 };

  if ((userData.stock || 0) < count) {
    return interaction.reply({ content: "所持株数が不足しています", flags: 64 });
  }

  const price = client.getStockPrice();

  // 売却処理
  userData.coins = (userData.coins || 0) + count * price;
  userData.stock -= count;
  client.coins.set(userId, userData);

  // 株価更新
  client.modifyStockByTrade("sell", count);

  return interaction.reply({ content: `株を${count}株売却しました` });
}
