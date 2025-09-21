import { SlashCommandBuilder } from "discord.js";
import fs from "fs";
import path from "path";

const __dirname = path.resolve();
const coinsFile = path.join(__dirname, "../coins.json");

export const data = new SlashCommandBuilder()
  .setName("trade_buy")
  .setDescription("株を購入します")
  .addIntegerOption(opt => opt.setName("count").setDescription("購入する株数").setRequired(true));

export async function execute(interaction, { client }) {
  const userId = interaction.user.id;
  const count = interaction.options.getInteger("count");
  if (count < 1) return interaction.reply({ content: "1株以上指定してください", ephemeral: true });

  const user = client.coins.get(userId) || { coins: 950, stock: 0 };
  const price = client.getStockPrice();
  const commission = Math.floor(count * price * 0.03 + count * 0.5);

  if (user.coins < count * price + commission) {
    return interaction.reply({ content: "所持金が不足しています（手数料込み）", ephemeral: true });
  }

  user.coins -= count * price + commission;
  user.stock = (user.stock || 0) + count;
  client.coins.set(userId, user);
  client.modifyStockByTrade("buy", count);

  saveCoins(client.coins);

  return interaction.reply({ content: `株を${count}株購入しました（手数料: ${commission}コイン）`, ephemeral: false });
}
