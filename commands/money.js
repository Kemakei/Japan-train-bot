import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('money')
  .setDescription('あなたの所持金等を確認します');

export async function execute(interaction) {
  try {
    const userId = interaction.user.id;
    const client = interaction.client;

    // ユーザーデータ取得
    const userData = client.coins.get(userId) || { coins: 0, stocks: 0 };
    const coins = userData.coins || 0;
    const stocks = userData.stocks || 0;

    // ヘッジ契約の確認
    const hedge = client.getHedge(userId);
    let hedgeAccumulated = 0;

    if (hedge) {
      const now = new Date();
      const jstOffset = 9 * 60; // JST +9時間
      const nowJST = new Date(now.getTime() + jstOffset * 60 * 1000);

      const lastUpdate = new Date(hedge.lastUpdateJST);
      const msPerDay = 24 * 60 * 60 * 1000;

      const daysPassed = Math.floor((nowJST.getTime() - lastUpdate.getTime()) / msPerDay);
      hedgeAccumulated = hedge.accumulated + hedge.amountPerDay * daysPassed;

      if (daysPassed > 0) {
        client.updateCoins(userId, hedge.amountPerDay * daysPassed);
        hedge.accumulated = 0;
        hedge.lastUpdateJST = nowJST.getTime();
        client.setHedge(userId, hedge);
      }
    }

    const embed = new EmbedBuilder()
      .setColor('Green')
      .setDescription(
        `**あなたの所持金: ${coins} コイン**` +
        `\n**保有株数: ${stocks} 株**` +
        (hedgeAccumulated > 0 ? `\n**契約中の保険金: ${hedgeAccumulated} コイン（次回加算済み）**` : '')
      );

    await interaction.reply({ embeds: [embed] });

  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("❌ 所持金確認中にエラーが発生しました");
    } else {
      await interaction.reply({ content: "❌ 所持金確認中にエラーが発生しました", ephemeral: true });
    }
  }
}
