import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getLatestDrawId } from "../utils/draw.js";

export const data = new SlashCommandBuilder()
  .setName("takarakuji_get")
  .setDescription("購入した宝くじの当選結果を確認します");

export async function execute(interaction) {
  const userId = interaction.user.id;
  const { lotteryCol, updateCoins, getCoins } = interaction.client;

  await interaction.deferReply();

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

  let totalPrize = 0;
  const publicLines = [];

  const keptPurchases = []; // ← 残すものをここに

  for (const p of purchases) {
    // 公開前 → 保持
    if (!p.drawId || p.drawId > latestDrawId) {
      keptPurchases.push(p);
      continue;
    }

    // 公開済み
    if (p.drawId <= latestDrawId) {
      // 結果未確認なら保持
      if (!p.checked) {
        if (p.isWin) {
          publicLines.push(
            `🎟 ${p.number}${p.letter} → 🏆 ${p.rank}等 💰 ${p.prize.toLocaleString()}コイン獲得！`
          );
          totalPrize += p.prize;
          await updateCoins(userId, p.prize);
        } else {
          publicLines.push(`🎟 ${p.number}${p.letter} → ❌ はずれ`);
        }

        // 結果確認済みにマーク（次回削除対象）
        p.checked = true;
        keptPurchases.push(p);
      }
      // 既に checked=true のものは削除（保持しない）
    }
  }

  // DB更新（保持対象だけ残す）
  await lotteryCol.updateOne(
    { userId },
    { $set: { purchases: keptPurchases } },
    { upsert: true }
  );

  const coins = await getCoins(userId);

  // --- 表示処理 ---
  if (publicLines.length > 0) {
    const embed = new EmbedBuilder()
      .setTitle("🎉 当選結果")
      .setDescription(
        publicLines.join("\n") +
          `\n\n合計当選金額: ${totalPrize.toLocaleString()}コイン\n残り所持金: ${coins.toLocaleString()}コイン`
      )
      .setColor(0xFFD700);
    await interaction.followUp({ embeds: [embed] });
  }

  // 公開済みの新規結果がない場合
  if (publicLines.length === 0) {
    const keptUnpublished = keptPurchases.filter(p => !p.drawId || p.drawId > latestDrawId);
    if (keptUnpublished.length > 0) {
      const embed = new EmbedBuilder()
        .setTitle("⏳ 未公開の抽選")
        .setDescription(`未公開チケット: ${keptUnpublished.length}枚`)
        .setColor(0xAAAAAA);
      await interaction.followUp({ embeds: [embed], flags: 64 });
    } else {
      const embed = new EmbedBuilder()
        .setTitle("📭 当選結果なし")
        .setDescription(
          `当選したチケットはありませんでした。\n合計当選金額: ${totalPrize.toLocaleString()}コイン\n残り所持金: ${coins.toLocaleString()}コイン`
        )
        .setColor(0x888888);
      await interaction.followUp({ embeds: [embed] });
    }
  }
}
