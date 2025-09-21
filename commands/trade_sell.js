import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("trade_sell")
  .setDescription("株を売却します")
  .addIntegerOption(opt => opt.setName("count").setDescription("売却する株数").setRequired(true));

export async function execute(interaction, { client }) {
  const userId = interaction.user.id;
  const count = interaction.options.getInteger("count");

  const user = client.coins.get(userId) || { coins: 950, stock: 0 };
  if (count < 1 || user.stock < count) {
    return interaction.reply({ content: "売却株数が不正です", flags: 64 });
  }

  const price = client.getStockPrice();
  user.coins += count * price;
  user.stock -= count;
  client.coins.set(userId, user);

  client.modifyStockByTrade("sell", count);

  return interaction.reply({ content: `株を${count}株売却しました` });
}
