import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("hedge_receive")
  .setDescription("たまった保険金を受け取ります");

export async function execute(interaction) {
  try {
    const userId = interaction.user.id;
    const client = interaction.client;
    const hedge = await client.getHedge(userId);

    if (!hedge) return interaction.reply({ content: "❌ 契約中の保険金がありません", flags: 64 });

    // データ破損チェック
    if (
      typeof hedge.amountPerDay !== 'number' || isNaN(hedge.amountPerDay) ||
      typeof hedge.accumulated !== 'number' || isNaN(hedge.accumulated) ||
      typeof hedge.lastDate !== 'string'
    ) {
      await client.clearHedge(userId);
      return interaction.reply({ content: "❌ 契約データが壊れています。再契約してください。", flags: 64 });
    }

    // JST基準で日数計算
    const now = new Date();
    const nowJST = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayStr = nowJST.toISOString().split("T")[0];

    const lastDate = new Date(hedge.lastDate + "T00:00:00+09:00");
    const todayDate = new Date(todayStr + "T00:00:00+09:00");

    const msPerDay = 24 * 60 * 60 * 1000;
    let daysPassed = Math.floor((todayDate - lastDate) / msPerDay);

    if (daysPassed <= 0) return interaction.reply({ content: "❌ まだ保険金はたまっていません", flags: 64 });

    let coins = await client.getCoins(userId);
    let totalAccumulated = hedge.accumulated;
    let contractEnded = false;

    for (let i = 0; i < daysPassed; i++) {
      // 1日分の契約額を引く
      if (coins >= hedge.amountPerDay) {
        coins -= hedge.amountPerDay;
        totalAccumulated += hedge.amountPerDay;
      } else {
        // コイン不足 → 契約終了、自動で累積返却
        contractEnded = true;
        break;
      }
    }

    // 所持コインを更新
    await client.updateCoins(userId, coins);

    if (contractEnded) {
      await client.clearHedge(userId);
      return interaction.reply({ content: `⚠️ コイン不足で契約が終了しました。累積保険金 ${totalAccumulated} コインを返却しました。`, ephemeral: false });
    }

    // 保険金受け取り条件（所持コイン >= 保険金の3倍）
    if (coins < totalAccumulated * 3) {
      // 契約は継続、日付だけ更新
      await client.setHedge(userId, {
        amountPerDay: hedge.amountPerDay,
        accumulated: totalAccumulated,
        lastDate: todayStr,
      });
      return interaction.reply({ content: `❌ 保険金の3倍のコインが必要です。現在 ${coins} コインでは受け取れません`, flags: 64 });
    }

    // 受け取り可能 → コイン加算＆契約終了
    await client.updateCoins(userId, totalAccumulated);
    await client.clearHedge(userId);

    await interaction.reply({
      content: `🎉 保険金 ${totalAccumulated} コインを受け取りました！契約は終了しました`,
      ephemeral: false
    });

  } catch (err) {
    console.error(err);
    await interaction.reply({ content: "❌ 受け取り処理中にエラーが発生しました", flags: 64 });
  }
}
