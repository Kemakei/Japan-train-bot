import { SlashCommandBuilder } from "discord.js";

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
      .setDescription("購入する株数（1〜500）")
      .setRequired(true)
  );

export async function execute(interaction, { client }) {
  const stockId = interaction.options.getString("stock");
  const count = interaction.options.getInteger("count");
  const userId = interaction.user.id;

  if (count < 1 || count > 500) {
    return interaction.reply({
      content: "❌ 株数は 1〜500 の範囲です",
      ephemeral: true
    });
  }

  const price = await client.getStockPrice(stockId);
  const total = price * count;
  const fee = Math.floor(total * 0.1) + 100;
  const pay = total + fee;

  const coins = await client.getCoins(userId);
  if (coins < pay) {
    return interaction.reply({
      content: "❌ コインが不足しています",
      ephemeral: true
    });
  }

  await client.updateCoins(userId, -pay);
  await client.updateStocks(userId, stockId, count);
  await client.modifyStockByTrade(stockId, "buy", count);

  await interaction.reply(
    `✅ **${STOCKS.find(s => s.id === stockId)?.name || stockId}** を **${count} 株** 購入しました\n` +
    `株価: ${price}\n` +
    `支払額: ${pay}`
  );
}
