import { SlashCommandBuilder } from "discord.js";

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
      .setRequired(true)
      .addChoices(...STOCKS.map(s => ({ name: s.name, value: s.id })))
  )
  .addIntegerOption(opt =>
    opt.setName("count")
      .setRequired(true)
  );

export async function execute(interaction, { client }) {
  const stockId = interaction.options.getString("stock");
  const count = interaction.options.getInteger("count");
  const userId = interaction.user.id;

  const user = await client.getUserData(userId);
  const owned = user.stocks?.[stockId] || 0;

  if (owned < count) {
    return interaction.reply({ content: "❌ 株不足", flags: 64 });
  }

  const price = await client.getStockPrice(stockId);
  const gain = price * count;

  await client.updateCoins(userId, gain);
  await client.updateStocks(userId, stockId, -count);
  await client.modifyStockByTrade(stockId, "sell", count);

  interaction.reply(
    `✅ ${count}株売却\n株価:${price}\n獲得:${gain}`
  );
}