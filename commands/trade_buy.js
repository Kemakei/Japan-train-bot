import { SlashCommandBuilder } from "discord.js";

// --- 購入クールダウン管理（ユーザーID → 最終購入時刻） ---
const lastBuyTimestamps = new Map();

export const data = new SlashCommandBuilder()
  .setName("buy")
  .setDescription("株を購入します")
  .addIntegerOption(opt =>
    opt.setName("count")
      .setDescription("購入する株数（最大500）")
      .setRequired(true)
  );

export async function execute(interaction, { client }) {
  const count = interaction.options.getInteger("count");
  const userId = interaction.user.id;

  // --- 株数上限チェック ---
  if (count <= 0)
    return interaction.reply({ content: "❌ 購入数は1以上にしてください", ephemeral: true });

  if (count > 500)
    return interaction.reply({ content: "❌ 一度に購入できるのは最大500株までです", ephemeral: true });

  // --- クールダウンチェック（15分 = 900000ms） ---
  const now = Date.now();
  const lastBuy = lastBuyTimestamps.get(userId);
  const cooldown = 15 * 60 * 1000;

  if (lastBuy && now - lastBuy < cooldown) {
    const remaining = cooldown - (now - lastBuy);
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return interaction.reply({
      content: `⏳ 購入クールダウン中です。あと **${minutes}分${seconds}秒** 待ってください。`,
      ephemeral: true,
    });
  }

  // --- 現在株価取得 ---
  const stockPrice = await client.getStockPrice();
  const totalCost = stockPrice * count;
  const fee = Math.floor(totalCost * 0.2) + 100;
  const totalPayment = totalCost + fee;

  // --- 所持コイン確認 ---
  const userCoins = await client.getCoins(userId);
  if (userCoins < totalPayment) {
    return interaction.reply({
      content: `❌ コインが足りません。\n必要コイン: ${totalPayment}（購入額: ${totalCost} + 手数料: ${fee}）`,
      ephemeral: true,
    });
  }

  // --- コイン減少処理 ---
  await client.updateCoins(userId, -totalPayment);

  // --- 株価変動処理 ---
  client.modifyStockByTrade("buy", count);

  // --- ユーザーデータ更新 ---
  const userDoc = await client.getUserData(userId);
  const prevStock = userDoc.stocks || 0;
  await client.updateStocks(userId, count);

  // --- クールダウン開始 ---
  lastBuyTimestamps.set(userId, now);

  // --- 結果返信 ---
  return interaction.reply(
    `✅ 株を **${count} 株** 購入しました！\n` +
    `📈 購入額: ${totalCost} コイン\n💸 手数料: ${fee} コイン\n💰 合計支払い: ${totalPayment} コイン\n` +
    `🏦 現在の保有株数: ${prevStock + count} 株\n` +
    `🕒 次回購入可能まで: **15分**`
  );
}
