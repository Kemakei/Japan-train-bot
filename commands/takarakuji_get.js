import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getLatestDrawId } from "../utils/draw.js";

export const data = new SlashCommandBuilder()
  .setName("takarakuji_get")
  .setDescription("購入した宝くじの当選結果を確認します");

export async function execute(interaction) {
  const userId = interaction.user.id;
  const { lotteryCol, db, updateCoins, getCoins } = interaction.client;

  await interaction.deferReply();

  // 購入履歴取得
  const purchasesDoc = await lotteryCol.findOne({ userId });
  const purchases = purchasesDoc?.purchases || [];

  // 購入履歴なし
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

    // 未公開チケット
    if (!drawId || drawId > latestDrawId) {
      ephemeralLines.push(`🎟 ${number}${letter} → ⏳ まだ抽選結果は出ていません`);
      remainingPurchases.push(purchase);
      continue;
    }

    const result = await drawResultsCol.findOne({ drawId });
    if (!result) {
      ephemeralLines.push(`🎟 ${number}${letter} → ⏳ まだ抽選結果は出ていません`);
      remainingPurchases.push(purchase);
      continue;
    }

    // 抽選済みチケット削除
    await lotteryCol.updateOne(
      { userId },
      { $pull: { purchases: { drawId } } }
    );

    if (result.isWin) {
      publicLines.push(`🎟 ${number}${letter} → 🏆 ${result.rank}等 💰 ${result.prize.toLocaleString()}コイン獲得！`);
      totalPrize += result.prize;
      await updateCoins(userId, result.prize);
    }
  }

  // 残り購入履歴更新
  await lotteryCol.updateOne(
    { userId },
    { $set: { purchases: remainingPurchases } },
    { upsert: true }
  );

  const coins = await getCoins(userId);

  // Embed作成関数（本文最後に合計当選金額と残り所持金を追加）
  const createEmbedsByLine = (lines, title, color = 0xFFD700) => {
    const embeds = [];
    let chunk = "";

    for (const line of lines) {
      const lineWithNewline = line + "\n";
      if ((chunk + lineWithNewline).length > 4000) {
        embeds.push(
          new EmbedBuilder()
            .setTitle(title)
            .setDescription(chunk + `\n合計当選金額: ${totalPrize.toLocaleString()}コイン\n残り所持金: ${coins.toLocaleString()}コイン`)
            .setColor(color)
        );
        chunk = "";
      }
      chunk += lineWithNewline;
    }

    if (chunk.length > 0) {
      embeds.push(
        new EmbedBuilder()
          .setTitle(title)
          .setDescription(chunk + `\n合計当選金額: ${totalPrize.toLocaleString()}コイン\n残り所持金: ${coins.toLocaleString()}コイン`)
          .setColor(color)
      );
    }

    return embeds;
  };

  // 公開済みチケット
  if (publicLines.length > 0) {
    const publicEmbeds = createEmbedsByLine(publicLines, "🎉 当選結果");
    for (const embed of publicEmbeds) {
      await interaction.followUp({ embeds: [embed] });
    }
  } else {
    // 当選なし
    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setTitle("📭 当選結果なし")
          .setDescription(`当選したチケットはありませんでした。\n合計当選金額: ${totalPrize.toLocaleString()}コイン\n残り所持金: ${coins.toLocaleString()}コイン`)
          .setColor(0x888888)
      ]
    });
  }

  // 未公開チケットは ephemeral
  if (ephemeralLines.length > 0) {
    const ephemeralEmbeds = createEmbedsByLine(ephemeralLines, "⏳ 未公開の抽選", 0xAAAAAA);
    for (const embed of ephemeralEmbeds) {
      await interaction.followUp({ embeds: [embed], flags: 64 });
    }
  }
}
