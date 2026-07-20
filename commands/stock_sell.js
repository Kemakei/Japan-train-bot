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
  .setName("stock_sell")
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
      .setMinValue(1)
  );

export async function execute(interaction, { client }) {
  const stockId = interaction.options.getString("stock");
  const count = interaction.options.getInteger("count");
  const userId = interaction.user.id;

  if (count <= 0) {
    return interaction.reply({
      content: "❌ 売却数は1以上にしてください",
      ephemeral: true,
    });
  }

  // ✅ 正しい株数取得方法
  const userDoc = await client.stockHistoryCol.findOne({ userId })
  const owned = userDoc.stocks?.[stockId] || 0;

  if (owned < count) {
    return interaction.reply({
      content: `❌ 売却できる株が不足しています\n現在の保有株数: ${owned} 株`,
      ephemeral: true,
    });
  }

  const stockPrice = await client.getStockPrice(stockId);
  const totalGain = stockPrice * count;

  await client.updateCoins(userId, totalGain);
  await client.stockHistoryCol.updateOne(
   { userId }, 
   { $inc: { [`stocks.${stockId}`]: -count } }, 
   { upsert: true }
  );
  await interaction.reply(
    `✅ ${STOCKS.find(s => s.id === stockId).name} を **${count} 株** 売却しました\n` +
    `💰 獲得コイン: ${totalGain}\n` +
    `📦 現在の保有株数: ${owned - count} 株`
  );
}
