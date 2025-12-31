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

export const data = new SlashCommandBuilder()
  .setName("trade_sell")
  .setDescription("株を売却します")
  .addStringOption(opt =>
    opt.setName("stock")
      .setDescription("売却する会社を選択")
      .setRequired(true)
      .addChoices(...STOCKS.map(s => ({ name: s.name, value: s.id })))
  )
  .addIntegerOption(opt =>
    opt.setName("count")
      .setDescription("売却する株数")
      .setRequired(true)
  );

export async function execute(interaction, { client }) {
  const stockId = interaction.options.getString("stock");
  const count = interaction.options.getInteger("count");
  const userId = interaction.user.id;

  // 所持株数確認
  const userDoc = await client.getUserData(userId);
  const owned = userDoc.stocks?.[stockId] || 0;

  if (owned < count) {
    return interaction.reply({
      content: `❌ 売却できる株が不足しています\n現在の保有株数: ${owned} 株`,
      flags: 64,
    });
  }

  // 現在株価取得
  const stockPrice = await client.getStockPrice(stockId);
  const totalGain = stockPrice * count;

  // コインを増やす
  await client.updateCoins(userId, totalGain);

  // 株数を減らす
  await client.updateStocks(userId, stockId, -count);

  // 結果返信
  interaction.reply(
    `✅ ${STOCKS.find(s => s.id === stockId).name} を **${count} 株** 売却しました（${totalGain} コイン獲得）\n` +
    `現在の保有株数: ${owned - count} 株`
  );
}