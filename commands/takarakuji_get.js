import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getLatestDrawId } from "../utils/draw.js";

export const data = new SlashCommandBuilder()
  .setName("takarakuji_get")
  .setDescription("購入した宝くじの当選結果を確認します");

export async function execute(interaction) {
  const userId = interaction.user.id;
  const { lotteryCol, db, updateCoins, getCoins } = interaction.client;

  await interaction.deferReply();

  // 購入履歴を取得
  const purchasesDoc = await lotteryCol.findOne({ userId });
  const purchases = purchasesDoc?.purchases || [];

  if (purchases.length === 0) {
    return interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ 購入履歴なし")
          .setDescription("現在、あなたの購入履歴はありません。")
          .setColor(0xFF0000)
      ],
      flags: 64
    });
  }

  const drawResultsCol = db.collection("drawResults");
  const publicLines = [];
  const ephemeralLines = [];
  const remainingPurchases = [];
  let totalPrize = 0;

  const now = new Date();
  const latestDrawId = getLatestDrawId(now);

  for (const purchase of purchases) {
    const { number, letter, drawId } = purchase;

    // 抽選前または未公開の場合
    if (!drawId || drawId > latestDrawId) {
      ephemeralLines.push(`🎟 ${number}${letter} → ⏳ まだ抽選結果は出ていません`);
      remainingPurchases.push(purchase);
      continue;
    }

    // 抽選済みの結果を取得
    const result = await drawResultsCol.findOne({ drawId });

    if (!result) {
      // DBに結果がまだ存在しない場合も未公開扱い
      ephemeralLines.push(`🎟 ${number}${letter} → ⏳ まだ抽選結果は出ていません`);
      remainingPurchases.push(purchase);
      continue;
    }

    // 抽選済みのチケットは削除（再取得されないように）
    await lotteryCol.updateOne(
      { userId },
      { $pull: { purchases: { drawId } } }
    );

    // 当選判定
    if (result.isWin) {
      publicLines.push(`🎟 ${number}${letter} → 🏆 ${result.rank}等 💰 ${result.prize.toLocaleString()}コイン`);
      totalPrize += result.prize;
      await updateCoins(userId, result.prize);
    }
  }

  // Embed作成関数
  const createEmbedsByLine = (lines, title, color = 0xFFD700) => {
    const embeds = [];
    let chunk = "";
    for (const line of lines) {
      if ((chunk + line + "\n").length > 4000) {
        embeds.push(
          new EmbedBuilder()
            .setTitle(title)
            .setDescription(chunk)
            .setColor(color)
        );
        chunk = "";
      }
      chunk += line + "\n";
    }
    if (chunk.length > 0) {
      embeds.push(
        new EmbedBuilder()
          .setTitle(title)
          .setDescription(chunk)
          .setColor(color)
      );
    }
    return embeds;
  };

  // 公開済みの結果を送信
  if (publicLines.length > 0) {
    const publicEmbeds = createEmbedsByLine(publicLines, "🎉 抽選結果");
    for (const embed of publicEmbeds) {
      await interaction.followUp({ embeds: [embed] });
    }
  }

  // 未公開の結果を ephemeral で送信
  if (ephemeralLines.length > 0) {
    const ephemeralEmbeds = createEmbedsByLine(ephemeralLines, "⏳ 未公開の抽選", 0xAAAAAA);
    for (const embed of ephemeralEmbeds) {
      await interaction.followUp({ embeds: [embed], flags: 64 });
    }
  }

  // 残りの購入履歴を DB に更新（未公開チケットを残す）
  await lotteryCol.updateOne(
    { userId },
    { $set: { purchases: remainingPurchases } },
    { upsert: true }
  );

  // 最新のコイン残高取得
  const coins = await getCoins(userId);

  // 最後にユーザーをメンションして合計当選金額・残りコインを表示
  await interaction.followUp({
    content: `<@${userId}> の合計当選金額: ${totalPrize.toLocaleString()}コイン、残りコイン: ${coins.toLocaleString()}コイン`
  });
}
