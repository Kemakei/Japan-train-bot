import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("takarakuji_get")
  .setDescription("購入した宝くじの結果を確認します");

export async function execute(interaction) {
  const userId = interaction.user.id;
  const { db, updateCoins, getCoins } = interaction.client;
  const lotteryCol = db.collection("lotteryTickets");
  const drawCol = db.collection("drawResults");

  await interaction.deferReply();

  const draws = await drawCol.find().toArray();
  const publishedDrawIds = new Set(draws.map(r => r.drawId));

  const tickets = await lotteryCol.find({ userId }).toArray();
  if (tickets.length === 0)
    return interaction.followUp({
      content: "❌ 購入履歴がありません。",
      flags: 64
    });

  let unpublishedCount = 0;
  let winResults = [];
  let totalPrize = 0;

  for (const t of tickets) {
    if (!publishedDrawIds.has(t.drawId)) {
      unpublishedCount++;
      continue;
    }

    if (t.isWin && t.prize > 0 && t.published === false) {
      winResults.push(`🎟 ${t.number}${t.letter} → 🏆${t.rank}等！${t.prize.toLocaleString()}コインゲット！`);
      totalPrize += t.prize;
      await lotteryCol.updateOne({ _id: t._id }, { $set: { published: true } });
    }
  }

  if (unpublishedCount > 0 && winResults.length === 0) {
    return interaction.followUp({
      content: `⏳ 未公開の抽選があります（${unpublishedCount}枚）`,
      flags: 64
    });
  }

  if (winResults.length === 0) {
    return interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setTitle("📭 当選結果なし")
          .setDescription("当たり結果はありませんでした。")
          .setColor(0x999999)
      ]
    });
  }

  await updateCoins(userId, totalPrize);
  const coins = await getCoins(userId);

  const fullText = winResults.join("\n");
  if (fullText.length > 4000) {
    const buffer = Buffer.from(fullText + `\n\n💰 合計: ${totalPrize.toLocaleString()}コイン\n💎 現在の所持金: ${coins.toLocaleString()}コイン`, "utf8");
    const file = new AttachmentBuilder(buffer, { name: "lottery_results.txt" });

    return interaction.followUp({
      content: `🎉 当選結果が多いためファイルでお送りします。\n💰 合計: ${totalPrize.toLocaleString()}コイン`,
      files: [file]
    });
  }

  const embed = new EmbedBuilder()
    .setTitle("🎉 当選結果")
    .setDescription(`${fullText}\n\n💰 合計: ${totalPrize.toLocaleString()}コイン\n💎 現在の所持金: ${coins.toLocaleString()}コイン`)
    .setColor(0xffd700);

  await interaction.followUp({ embeds: [embed] });
}
