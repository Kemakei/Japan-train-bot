// commands/trade_buy.js
import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("trade_buy")
  .setDescription("株を購入します")
  .addIntegerOption(opt =>
    opt.setName("count")
      .setDescription("購入する株数")
      .setRequired(true)
  );

export async function execute(interaction, { client }) {
  const userId = interaction.user.id;
  const count = interaction.options.getInteger("count");

  if (count < 1) {
    return interaction.reply({ content: "1株以上指定してください", flags: 64 });
  }

  const price = client.getStockPrice();
  const userData = client.coins.get(userId) || { coins: 0, stock: 0 };
  const commission = Math.floor(count * price * 0.03 + count * 0.5);

  if ((userData.coins || 0) < count * price + commission) {
    return interaction.reply({ content: "所持金が不足しています（手数料込み）", flags: 64 });
  }

  // 購入処理
  userData.coins -= (count * price + commission);
  userData.stock = (userData.stock || 0) + count;
  client.coins.set(userId, userData);

  // 株価更新
  client.modifyStockByTrade("buy", count);

  return interaction.reply({ content: `株を${count}株購入しました（手数料: ${commission}コイン）` });
}
