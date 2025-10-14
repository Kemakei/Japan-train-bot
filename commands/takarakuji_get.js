import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getLatestDrawId } from "../utils/draw.js";

export const data = new SlashCommandBuilder()
  .setName("takarakuji_get")
  .setDescription("購入した宝くじの当選結果を確認します");

export async function execute(interaction) {
  const userId = interaction.user.id;
  const { lotteryCol, db, updateCoins, getCoins } = interaction.client;

  await interaction.deferReply();

  const purchasesDoc = await lotteryCol.findOne({ userId }, { projection: { purchases: 1 } });
  const purchases = purchasesDoc?.purchases || [];

  // ✅ 購入履歴がない場合は ephemeral（flags: 64）でエラーメッセージを返す
  if (purchases.length === 0) {
    return interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ 購入履歴なし")
          .setDescription("現在、あなたの購入履歴はありません。")
          .setColor(0xff0000)
      ],
      flags: 64 // ← Discord.js v13 での ephemeral 指定
    });
  }

  const now = new Date();
  const latestDrawId = getLatestDrawId(now);

  const drawResultsArr = await db.collection("drawResults").find().toArray();
  const publishedDrawIds = new Set(drawResultsArr.map(r => r.drawId));

  let totalPrize = 0;
  const publicLines = [];
  let updatedCount = 0;
  const updatedPurchases = [];

  for (let i = 0; i < purchases.length; i++) {
    const p = purchases[i];
    const isUnpublished = !p.drawId || !publishedDrawIds.has(p.drawId);
    if (isUnpublished) {
      updatedPurchases.push(p);
      continue;
    }

    if (!p.checked) {
      p.checked = true;
      updatedCount++;

      if (p.isWin) {
        totalPrize += p.prize;
        if (publicLines.length < 500) {
          publicLines.push(
            `🎟 ${p.number}${p.letter} → 🏆 ${p.rank}等 💰 ${p.prize.toLocaleString()}コイン獲得！`
          );
        }
      }
    }
    updatedPurchases.push(p);
  }

  if (totalPrize > 0) {
    await updateCoins(userId, totalPrize);
  }

  if (updatedCount > 0) {
    await lotteryCol.updateOne(
      { userId },
      { $set: { purchases: updatedPurchases } },
      { upsert: true }
    );
  }

  const coins = await getCoins(userId);

  const embedList = [];

  if (publicLines.length > 0) {
    const embed = new EmbedBuilder()
      .setTitle("🎉 当選結果")
      .setDescription(
        publicLines.join("\n") +
          (purchases.length > 500
            ? `\n\n（ほか ${purchases.length - 500} 枚は省略）`
            : "") +
          `\n\n合計当選金額: ${totalPrize.toLocaleString()}コイン\n残り所持金: ${coins.toLocaleString()}コイン`
      )
      .setColor(0xffd700);

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
            `合計当選金額: ${totalPrize.toLocaleString()}コイン\n残り所持金: ${coins.toLocaleString()}コイン`
        )
        .setColor(0x888888)
    );
  }

  for (const embed of embedList) {
    await interaction.followUp({ embeds: [embed] });
  }
}
