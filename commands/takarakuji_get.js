import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getLatestDrawId } from "../utils/draw.js";

export const data = new SlashCommandBuilder()
  .setName("takarakuji_get")
  .setDescription("購入した宝くじの当選結果を確認します");

export async function execute(interaction) {
  const userId = interaction.user.id;
  const { lotteryCol, updateCoins, getCoins } = interaction.client;

  await interaction.deferReply();

  // 購入履歴取得
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

  const now = new Date();
  const latestDrawId = getLatestDrawId(now);

  // 未公開チケットと抽選済みチケットに分割
  const unpublishedPurchases = [];
  const processedPurchases = [];

  for (const purchase of purchases) {
    if (!purchase.drawId || purchase.drawId > latestDrawId) {
      unpublishedPurchases.push(purchase);
    } else {
      processedPurchases.push(purchase);
    }
  }

  let totalPrize = 0;
  const publicLines = [];

  // 抽選済みチケットの当たり判定
  for (const p of processedPurchases) {
    if (p.isWin) {
      publicLines.push(`🎟 ${p.number}${p.letter} → 🏆 ${p.rank}等 💰 ${p.prize.toLocaleString()}コイン獲得！`);
      totalPrize += p.prize;
      await updateCoins(userId, p.prize);
    }
  }

  // 未公開チケットだけ残す
  await lotteryCol.updateOne(
    { userId },
    { $set: { purchases: unpublishedPurchases } },
    { upsert: true }
  );

  const coins = await getCoins(userId);

  // Embed作成関数（複数Embed対応）
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

  // 公開済み当たりチケット
  if (publicLines.length > 0) {
    const publicEmbeds = createEmbedsByLine(publicLines, "🎉 当選結果");
    for (const embed of publicEmbeds) {
      await interaction.followUp({ embeds: [embed] });
    }
  }

  // 未公開チケット（枚数だけ、ephemeral）
  if (unpublishedPurchases.length > 0) {
    const pendingLines = [`未公開チケット: ${unpublishedPurchases.length}枚`];
    const pendingEmbeds = createEmbedsByLine(pendingLines, "⏳ 未公開の抽選", 0xAAAAAA);
    for (const embed of pendingEmbeds) {
      await interaction.followUp({ embeds: [embed], flags: 64 });
    }
  }

  // 当たりも未公開もない場合
  if (publicLines.length === 0 && unpublishedPurchases.length === 0) {
    const emptyEmbed = new EmbedBuilder()
      .setTitle("📭 当選結果なし")
      .setDescription(`当選したチケットはありませんでした。\n合計当選金額: ${totalPrize.toLocaleString()}コイン\n残り所持金: ${coins.toLocaleString()}コイン`)
      .setColor(0x888888);
    await interaction.followUp({ embeds: [emptyEmbed] });
  }
}
