import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getLatestDrawId } from "../utils/draw.js";

export const data = new SlashCommandBuilder()
  .setName("takarakuji_get")
  .setDescription("購入した宝くじの当選結果を確認します");

export async function execute(interaction) {
  const userId = interaction.user.id;
  const { db, updateCoins, getCoins } = interaction.client;
  const lotteryCol = db.collection("lotteryPurchases");

  await interaction.deferReply();

  // TTL（7日後自動削除）
  try {
    await lotteryCol.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 60 * 60 * 24 * 7 }
    );
  } catch {}

  const now = new Date();
  const latestDrawId = getLatestDrawId(now);
  const drawResults = await db.collection("drawResults").find().toArray();
  const publishedDrawIds = new Set(drawResults.map(r => r.drawId));

  const purchases = await lotteryCol
    .find({ userId, checked: { $ne: true } })
    .toArray();

  if (purchases.length === 0) {
    return interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ 購入履歴なし")
          .setDescription("現在、あなたの購入済みチケットはありません。")
          .setColor(0xff0000)
      ],
      flags: 64
    });
  }

  let totalPrize = 0;
  const publicLines = [];
  let unpublishedCount = 0;
  const bulkOps = [];

  for (const p of purchases) {
    const isUnpublished = !p.drawId || !publishedDrawIds.has(p.drawId);

    if (isUnpublished) {
      unpublishedCount++;
      continue;
    }

    const updateDoc = { $set: { checked: true } };

    if (p.isWin) {
      totalPrize += p.prize;
      // ✅ 賞金額まで明示
      publicLines.push(
        `🎟 ${p.number}${p.letter} → 🏆 ${p.rank}等！💰 ${p.prize.toLocaleString()}コイン！`
      );
    }

    bulkOps.push({
      updateOne: {
        filter: { _id: p._id },
        update: updateDoc
      }
    });
  }

  if (bulkOps.length > 0) await lotteryCol.bulkWrite(bulkOps);
  if (totalPrize > 0) await updateCoins(userId, totalPrize);

  const coins = await getCoins(userId);

  // --- Embed生成（行単位で分割 + 最後に集計情報） ---
  const createEmbedsByLine = (lines, title, color = 0xffd700) => {
    const embeds = [];
    let chunk = [];

    for (const line of lines) {
      const joined = [...chunk, line].join("\n");
      if (joined.length > 4000) {
        embeds.push(
          new EmbedBuilder()
            .setTitle(title)
            .setDescription(chunk.join("\n"))
            .setColor(color)
        );
        chunk = [line];
      } else {
        chunk.push(line);
      }
    }

    if (chunk.length > 0) {
      let desc = chunk.join("\n");
      // ✅ 最後のEmbedに集計情報を追加
      desc += `\n\n━━━━━━━━━━━━━━\n💰 合計当選金額: ${totalPrize.toLocaleString()}コイン\n💎 現在の所持金: ${coins.toLocaleString()}コイン`;
      embeds.push(
        new EmbedBuilder()
          .setTitle(title)
          .setDescription(desc)
          .setColor(color)
      );
    }

    return embeds;
  };

  // --- 結果表示 ---
  if (publicLines.length > 0) {
    const publicEmbeds = createEmbedsByLine(publicLines, "🎉 当選結果");
    await interaction.followUp({ embeds: publicEmbeds });
  } else if (unpublishedCount > 0) {
    const embed = new EmbedBuilder()
      .setTitle("⏳ 未公開の抽選")
      .setDescription(`未公開チケット: ${unpublishedCount}枚`)
      .setColor(0xaaaaaa);
    await interaction.followUp({ embeds: [embed], flags: 64 });
  } else {
    const embed = new EmbedBuilder()
      .setTitle("📭 当選結果なし")
      .setDescription(
        `当選したチケットはありませんでした。\n\n💰 合計当選金額: ${totalPrize.toLocaleString()}コイン\n💎 現在の所持金: ${coins.toLocaleString()}コイン`
      )
      .setColor(0x888888);
    await interaction.followUp({ embeds: [embed] });
  }
}
