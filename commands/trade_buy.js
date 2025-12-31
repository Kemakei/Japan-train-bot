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
  .setName("trade_buy")
  .setDescription("株を購入します")
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

  if (count <= 0 || count > 500) {
    return interaction.reply({ content: "❌ 株数は1〜500", flags: 64 });
  }

  const price = await client.getStockPrice(stockId);
  const total = price * count;
  const fee = Math.floor(total * 0.1) + 100;
  const pay = total + fee;

  const coins = await client.getCoins(userId);
  if (coins < pay) {
    return interaction.reply({ content: "❌ コイン不足", flags: 64 });
  }

  await client.updateCoins(userId, -pay);
  await client.updateStocks(userId, stockId, count);
  await client.modifyStockByTrade(stockId, "buy", count);

  interaction.reply(
    `✅ ${count}株購入\n株価:${price}\n支払:${pay}`
  );
}