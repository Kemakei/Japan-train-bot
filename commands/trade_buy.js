import { SlashCommandBuilder } from "discord.js";

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

  const userId = interaction.user.id;

  // 現在株価を取得
  const stockPrice = await client.getStockPrice();
  const totalCost = stockPrice * count;
  const fee = Math.floor(totalCost * 0.2) + 100;
  const totalPayment = totalCost + fee;

  // 所持コインを取得
  const userCoins = await client.getCoins(userId);
  if (userCoins < totalPayment) {
    return interaction.reply({ content: `❌ コインが足りません\n必要コイン: ${totalPayment}（購入額: ${totalCost} + 手数料: ${fee}）`, flags: 64 });
  }

  // コインを減らす
  await client.updateCoins(userId, -totalPayment);

  // 株価変動
  client.modifyStockByTrade("buy", count);

  // 株数更新 (MongoDB)
  const userDoc = await client.getUserData(userId);
  const prevStock = userDoc.stocks || 0;
  await client.updateStocks(userId, count);

  interaction.reply(
    `✅ 株を ${count} 株購入しました\n` +
    `購入額: ${totalCost} コイン\n手数料: ${fee} コイン\n合計支払い: ${totalPayment} コイン\n` +
    `現在の保有株数: ${prevStock + count} 株`
  );
}
