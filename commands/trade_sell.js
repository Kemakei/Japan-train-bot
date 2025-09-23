import { SlashCommandBuilder } from "discord.js";

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

  const userId = interaction.user.id;

  // MongoDB から株数取得
  const userDoc = await client.getUserData(userId);
  const userStock = userDoc.stocks || 0;

  if (userStock < count) {
    return interaction.reply({ content: `❌ 売却できる株が不足しています\n現在の保有株数: ${userStock} 株`, flags: 64 });
  }

  // 現在の株価を取得
  const stockPrice = await client.getStockPrice();
  const totalGain = stockPrice * count;

  // コインを増やす
  await client.updateCoins(userId, totalGain);

  // 株価変動
  client.modifyStockByTrade("sell", count);

  // 株数を減らす
  await client.updateStocks(userId, -count);

  interaction.reply(
    `✅ 株を ${count} 株売却しました（${totalGain} コイン獲得）\n` +
    `現在の保有株数: ${userStock - count} 株`
  );
}
