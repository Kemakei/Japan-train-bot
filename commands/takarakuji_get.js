import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getNextDrawId } from "../utils/draw.js";

export const data = new SlashCommandBuilder()
  .setName("takarakuji_get")
  .setDescription("購入した宝くじの結果を確認します");

export async function execute(interaction) {
  const userId = interaction.user.id;
  const { lotteryCol, db, updateBalance, publishedDrawIds } = interaction.client;

  const userData = await lotteryCol.findOne({ userId });
  if (!userData || !userData.purchases?.length) {
    return interaction.reply({ content: "❌ 購入履歴がありません。", ephemeral: true });
  }

  const purchases = userData.purchases;
  const publicLines = [];
  const unpublishedLines = [];
  let hadAnyWinPublished = false;
  let totalPrize = 0;
  const newPurchases = [];

  for (const p of purchases) {
    const isPublished = p.drawId && publishedDrawIds.has(p.drawId);

    if (!isPublished) {
      newPurchases.push(p);
      continue;
    }

    if (!p.checked) {
      p.checked = true;

      if (p.isWin) {
        hadAnyWinPublished = true;
        totalPrize += p.prize || 0;
        if (publicLines.length < 500) {
          publicLines.push(
            `🎟 ${p.number}${p.letter} → 🏆 ${p.rank}等 💰 ${Number(p.prize || 0).toLocaleString()}コイン獲得！`
          );
        }
      } else if (publicLines.length < 500) {
        publicLines.push(`🎟 ${p.number}${p.letter} → ✖ 残念、外れ...`);
      }
    }
  }

  if (unpublishedLines.length === 0 && publicLines.length === 0) {
    return interaction.reply({ content: "📭 当選結果はまだ発表されていません。", ephemeral: true });
  }

  await lotteryCol.updateOne(
    { userId },
    { $pull: { purchases: { checked: true } } } // 確認済みを削除
  );

  if (hadAnyWinPublished) {
    await updateBalance(userId, totalPrize);
  }

  const embed = new EmbedBuilder()
    .setTitle("🎟 宝くじ結果")
    .setDescription(publicLines.join("\n") || "📭 当選結果なし")
    .setColor(hadAnyWinPublished ? 0xffd700 : 0x00bfff)
    .setFooter({ text: hadAnyWinPublished ? `💰 獲得合計: ${totalPrize.toLocaleString()}コイン` : "またの挑戦を！" });

  await interaction.reply({ embeds: [embed], ephemeral: false });

  const updated = await lotteryCol.findOne({ userId });
  if (!updated?.purchases?.length) {
    await lotteryCol.deleteOne({ userId });
  }
}
