import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("trade_sell")
  .setDescription("株を売却します")
  .addStringOption(option =>
    option
      .setName("stock")
      .setDescription("売却する会社を選択")
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
      .setDescription("売却する株数（1〜500）")
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

  const owned = await client.getUserStock(userId, stockId);
  if (owned < count) {
    return interaction.reply({
      content: "❌ 所有株数が足りません",
      ephemeral: true
    });
  }

  const price = await client.getStockPrice(stockId);
  const total = price * count;
  const fee = Math.floor(total * 0.1) + 100;
  const gain = total - fee;

  await client.updateStocks(userId, stockId, -count);
  await client.updateCoins(userId, gain);
  await client.modifyStockByTrade(stockId, "sell", count);

  await interaction.reply(
    `✅ **${STOCKS.find(s => s.id === stockId)?.name || stockId}** を **${count} 株** 売却しました\n` +
    `株価: ${price}\n` +
    `受取額: ${gain}`
  );
}
