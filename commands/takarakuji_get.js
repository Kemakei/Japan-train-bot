import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getLatestDrawId } from "../utils/draw.js";

export const data = new SlashCommandBuilder()
  .setName("takarakuji_get")
  .setDescription("購入した宝くじの当選結果を確認します");

export async function execute(interaction) {
  const userId = interaction.user.id;
  const { lotteryTickets, updateCoins, getCoins, db } = interaction.client;

  await interaction.deferReply();

  // --- 修正箇所: purchasesDoc 取得を lotteryTickets に変更 ---
  const purchases = await lotteryTickets.find({ userId }).toArray();

  if (purchases.length === 0) {
    return interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ 購入履歴なし")
          .setDescription("現在、あなたの購入履歴はありません。")
          .setColor(0xff0000)
      ],
      flags: 64
    });
  }

  const now = new Date();
  const latestDrawId = getLatestDrawId(now);

  const drawResultsArr = await db.collection("drawResults").find().toArray();
  const publishedDrawIds = new Set(drawResultsArr.map(r => r.drawId));

  let totalPrize = 0;
  let winCount = 0;
  const publicLines = [];
  const remainingPurchases = [];

  for (const p of purchases) {
    const isUnpublished = !p.drawId || !publishedDrawIds.has(p.drawId);

    if (isUnpublished) {
      remainingPurchases.push(p);
      continue;
    }

    // --- 修正箇所: 当選チケットは個別に削除 ---
    if (!p.claimed && p.isWin) {
      totalPrize += p.prize;
      winCount++;

      if (publicLines.length < 100) {
        publicLines.push(
          `🎟 ${p.number}${p.letter} → 🏆 ${p.rank}等 💰 ${p.prize.toLocaleString()}コイン獲得！`
        );
      }

      await lotteryTickets.deleteOne({ _id: p._id });
      continue;
    }

    remainingPurchases.push(p);
  }

  if (totalPrize > 0) {
    await updateCoins(userId, totalPrize);
  }

  const coins = await getCoins(userId);
  const embedList = [];

  // 🟢 修正追加箇所: すべて確認済みなら「購入履歴なし」を表示
  if (remainingPurchases.length === 0) {
    return interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ 購入履歴なし")
          .setDescription("すべての購入済み宝くじの結果を確認済みです。")
          .setColor(0xff0000)
      ],
      flags: 64
    });
  }

  if (publicLines.length > 0) {
    const embed = new EmbedBuilder()
      .setTitle("🎉 当選結果")
      .setDescription(publicLines.join("\n"))
      .setColor(0xffd700)
      .setFooter({
        text: `🎟 当選チケット: ${winCount}${winCount > 100 ? " (最初の100枚のみ表示)" : ""} | 💰 合計当選金額: ${totalPrize.toLocaleString()}コイン | 所持金: ${coins.toLocaleString()}コイン`
      });

    embedList.push(embed);
  }

  const unpublishedCount = purchases.filter(p => !p.drawId || !publishedDrawIds.has(p.drawId)).length;
  if (unpublishedCount > 0 && publicLines.length === 0) {
    embedList.push(
      new EmbedBuilder()
        .setTitle("⏳ 未公開の抽選")
        .setDescription(`未公開チケット: ${unpublishedCount.toLocaleString()}枚`)
        .setColor(0xaaaaaa)
    );
  }

  if (publicLines.length === 0 && unpublishedCount === 0) {
    embedList.push(
      new EmbedBuilder()
        .setTitle("📭 当選結果なし")
        .setDescription(
          `当選したチケットはありませんでした。\n` +
            `合計当選金額: ${totalPrize.toLocaleString()}コイン\n所持金: ${coins.toLocaleString()}コイン`
        )
        .setColor(0x888888)
    );
  }

  for (const embed of embedList) {
    await interaction.followUp({ embeds: [embed] });
  }
}
