import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("hedge_receive")
  .setDescription("たまった保険金を受け取ります");

export async function execute(interaction) {
  try {
    const userId = interaction.user.id;
    const client = interaction.client;
    const hedge = client.getHedge(userId);

    if (!hedge) return interaction.reply({ content: "❌ 契約中の保険金がありません", ephemeral: true });

    // JST基準で日数計算
    const now = new Date();
    const jstOffset = 9 * 60;
    const nowJST = new Date(now.getTime() + jstOffset * 60 * 1000);

    const lastUpdate = new Date(hedge.lastUpdateJST);
    const msPerDay = 24 * 60 * 60 * 1000;

    const daysPassed = Math.floor((nowJST.getTime() - lastUpdate.getTime()) / msPerDay);
    const total = hedge.accumulated + hedge.amountPerDay * daysPassed;

    client.updateCoins(userId, total);
    client.clearHedge(userId);

    await interaction.reply({
      content: `🎉 保険金 ${total} コインを受け取りました！契約は終了しました`,
      ephemeral: false
    });

  } catch (err) {
    console.error(err);
    await interaction.reply({ content: "❌ 受け取り処理中にエラーが発生しました", ephemeral: true });
  }
}
