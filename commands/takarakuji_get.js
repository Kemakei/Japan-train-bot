import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

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
  const publishedDrawIds = new Set(
    draws.filter(r => r.published).map(r => r.drawId)
  );

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
      winResults.push(`🎟️ ${t.number}${t.letter} → 🏆${t.rank}等！${t.prize.toLocaleString()}コインゲット！`);
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

  // ----- Embed 分割処理 -----
  const embeds = [];
  const maxLength = 4000; // Discord Embed Description 最大文字数
  let buffer = "";

  for (const line of winResults) {
    // 追加しても上限超えない場合は追加
    if ((buffer + line + "\n").length > maxLength) {
      embeds.push(
        new EmbedBuilder()
          .setTitle("🎉 当選結果")
          .setDescription(buffer)
          .setColor(0xffd700)
          .setFooter({ text: `💰 合計: ${totalPrize.toLocaleString()}コイン | 💎 現在の所持金: ${coins.toLocaleString()}コイン` })
      );
      buffer = "";
    }
    buffer += line + "\n";
  }

  // 最後に残った分を追加
  if (buffer) {
    embeds.push(
      new EmbedBuilder()
        .setTitle("🎉 当選結果")
        .setDescription(buffer)
        .setColor(0xffd700)
        .setFooter({ text: `💰 合計: ${totalPrize.toLocaleString()}コイン | 💎 現在の所持金: ${coins.toLocaleString()}コイン` })
    );
  }

  // 複数 Embed を順番に送信
  for (const embed of embeds) {
    await interaction.followUp({ embeds: [embed] });
  }
}
