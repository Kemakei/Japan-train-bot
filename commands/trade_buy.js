import { SlashCommandBuilder } from "discord.js";

// 株マスタ（8社固定）
const STOCKS = [
  { id: "A", name: "tootle株式会社" },
  { id: "B", name: "ハイシロソフト株式会社" },
  { id: "C", name: "バナナ株式会社" },
  { id: "D", name: "ネムーイ株式会社" },
  { id: "E", name: "ナニイッテンノー株式会社" },
  { id: "F", name: "ダカラナニー株式会社" },
  { id: "G", name: "ホシーブックス株式会社" },
  { id: "H", name: "ランランルー株式会社" },
];

// --- 購入クールダウン管理（ユーザーID → 最終購入時刻） ---
const lastBuyTimestamps = new Map();

export const data = new SlashCommandBuilder()
  .setName("trade_buy")
  .setDescription("株を購入します")
  .addStringOption(opt =>
    opt.setName("stock")
      .setDescription("購入する会社を選択")
      .setRequired(true)
      .addChoices(...STOCKS.map(s => ({ name: s.name, value: s.id })))
  )
  .addIntegerOption(opt =>
    opt.setName("count")
      .setDescription("購入する株数（最大500）")
      .setRequired(true)
  );

export async function execute(interaction, { client }) {
  const stockId = interaction.options.getString("stock");
  const count = interaction.options.getInteger("count");
  const userId = interaction.user.id;

  // --- 株数チェック ---
  if (count <= 0)
    return interaction.reply({ content: "❌ 購入数は1以上にしてください", flags: 64 });
  if (count > 500)
    return interaction.reply({ content: "❌ 一度に購入できるのは最大500株までです", flags: 64 });

  // --- クールダウンチェック（15分） ---
  const now = Date.now();
  const lastBuy = lastBuyTimestamps.get(userId);
  const cooldown = 15 * 60 * 1000;
  if (lastBuy && now - lastBuy < cooldown) {
    const remaining = cooldown - (now - lastBuy);
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return interaction.reply({
      content: `⏳ 購入クールダウン中です。あと **${minutes}分${seconds}秒** 待ってください。`,
      flags: 64,
    });
  }

  // --- 現在株価取得 ---
  const stockPrice = await client.getStockPrice(stockId);
  const totalCost = stockPrice * count;
  const fee = Math.floor(totalCost * 0.1) + 100; // 手数料
  const totalPayment = totalCost + fee;

  // --- 所持コイン確認 ---
  const userCoins = await client.getCoins(userId);
  if (userCoins < totalPayment) {
    return interaction.reply({
      content: `❌ コインが足りません。\n必要コイン: ${totalPayment}（購入額: ${totalCost} + 手数料: ${fee}）`,
      flags: 64,
    });
  }

  // --- コイン減少 ---
  await client.updateCoins(userId, -totalPayment);

  // --- 株数増加 ---
  const userDoc = await client.getUserData(userId);
  const prevStock = userDoc.stocks?.[stockId] || 0;
  await client.updateStocks(userId, stockId, count);

  // --- クールダウン開始 ---
  lastBuyTimestamps.set(userId, now);

  // --- 結果返信 ---
  interaction.reply(
    `✅ ${STOCKS.find(s => s.id === stockId).name} を **${count} 株** 購入しました！\n` +
    `📈 購入額: ${totalCost} コイン\n💸 手数料: ${fee} コイン\n💰 合計支払い: ${totalPayment} コイン\n` +
    `🏦 現在の保有株数: ${prevStock + count} 株\n` +
    `🕒 次回購入可能まで: **15分**`
  );
}