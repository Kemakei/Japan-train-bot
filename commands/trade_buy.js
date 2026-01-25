import { SlashCommandBuilder } from "discord.js";

/** クールダウン管理 */
const buyCooldown = new Map(); // userId => timestamp
const COOLDOWN_TIME = 5 * 60 * 1000; // 5分

export const data = new SlashCommandBuilder()
  .setName("trade_buy")
  .setDescription("株を購入します")
  .addStringOption(option =>
    option
      .setName("stock")
      .setDescription("購入する会社を選択")
      .setRequired(true)
      .addChoices(
        { name: "tootle株式会社", value: "A" },
        { name: "ハイシロソフト株式会社", value: "B" },
        { name: "バナナ株式会社", value: "C" },
        { name: "ネムーイ株式会社", value: "D" },
        { name: "ナニイッテンノー株式会社", value: "E" },
        { name: "ダカラナニー株式会社", value: "F" },
        { name: "ホシーブックス株式会社", value: "G" },
        { name: "ランランルー株式会社", value: "H" }
      )
  )
  .addIntegerOption(option =>
    option
      .setName("count")
      .setDescription("購入する株数（1〜1000）")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(1000)
  );

export async function execute(interaction, { client }) {
  const userId = interaction.user.id;
  const stockId = interaction.options.getString("stock");
  const count = interaction.options.getInteger("count");
  const now = Date.now();

  /** クールダウンチェック（0分を表示しない） */
  const lastBuy = buyCooldown.get(userId);
  if (lastBuy && now - lastBuy < COOLDOWN_TIME) {
    const remainMs = COOLDOWN_TIME - (now - lastBuy);
    const remainSec = Math.ceil(remainMs / 1000);
    const minutes = Math.floor(remainSec / 60);
    const seconds = remainSec % 60;

    const timeText =
      minutes > 0
        ? `${minutes}分${seconds}秒`
        : `${seconds}秒`;

    return interaction.reply({
      content: `⏳ 再購入は **${timeText}後** に可能です`,
      ephemeral: true
    });
  }

  /** 株数チェック */
  if (count < 1 || count > 1000) {
    return interaction.reply({
      content: "❌ 株数は 1〜1000 の範囲です",
      ephemeral: true
    });
  }

  const price = await client.getStockPrice(stockId);
  const total = price * count;
  const fee = Math.floor(total * 0.1) + 100;
  const pay = total + fee;

  const STOCKS = [
    { id: "A", name: "tootle株式会社" },
    { id: "B", name: "ハイシロソフト株式会社" },
    { id: "C", name: "バナナ株式会社" },
    { id: "D", name: "ネムーイ株式会社" },
    { id: "E", name: "ナニイッテンノー株式会社" },
    { id: "F", name: "ダカラナニー株式会社" },
    { id: "G", name: "ホシーブックス株式会社" },
    { id: "H", name: "ランランルー株式会社" }
  ];

  const coins = await client.getCoins(userId);
  if (coins < pay) {
    return interaction.reply({
      content: "❌ コインが不足しています",
      ephemeral: true
    });
  }

  /** コイン減算 */
  await client.updateCoins(userId, -pay);

  /** 株を加算 */
  await client.stockHistoryCol.updateOne(
    { userId },
    { $inc: { [`stocks.${stockId}`]: count } },
    { upsert: true }
  );

  /** クールダウン設定 */
  buyCooldown.set(userId, now);

  await interaction.reply(
    `✅ **${STOCKS.find(s => s.id === stockId)?.name || stockId}** を **${count} 株** 購入しました\n` +
    `株価: ${price}\n` +
    `手数料: ${fee}\n` +
    `支払額: ${pay}`
  );
}