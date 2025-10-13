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

  // 公開済みの drawId を取得
  const publishedDraws = await drawCol
    .find({ published: true })
    .project({ drawId: 1 })
    .toArray();

  const publishedDrawIds = new Set(publishedDraws.map(d => d.drawId));

  if (publishedDrawIds.size === 0) {
    return interaction.followUp({
      content: "🕒 現在、公開済みの抽選結果はありません。",
      flags: 64
    });
  }

  // カーソル方式で段階的に取得
  const cursor = lotteryCol.find(
    { userId, drawId: { $in: Array.from(publishedDrawIds) }, published: false },
    { projection: { number: 1, letter: 1, prize: 1, rank: 1, isWin: 1 } }
  );

  let totalPrize = 0;
  let winResults = [];
  const maxLength = 4000;
  let buffer = "";
  const embeds = [];
  let hasAny = false;

  for await (const t of cursor) {
    hasAny = true;

    if (t.isWin && t.prize > 0) {
      const line = `🎟️ ${t.number}${t.letter} → 🏆${t.rank}等！${t.prize.toLocaleString()}コイン獲得！\n`;
      if (buffer.length + line.length > maxLength) {
        embeds.push(
          new EmbedBuilder()
            .setTitle("🎉 当選結果")
            .setDescription(buffer)
            .setColor(0xffd700)
        );
        buffer = "";
      }
      buffer += line;
      totalPrize += t.prize;

      // 公開済みに更新
      await lotteryCol.updateOne({ _id: t._id }, { $set: { published: true } });
    }
  }

  // チケットがなかった場合
  if (!hasAny) {
    return interaction.followUp({
      content: "❌ 購入履歴がありません。",
      flags: 64
    });
  }

  // 当選が一件もない場合
  if (totalPrize === 0) {
    return interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setTitle("📭 当選結果なし")
          .setDescription("残念！当たりはありませんでした。")
          .setColor(0x999999)
      ]
    });
  }

  // 最後のembedに合計金額を追記
  if (buffer.length > 0) {
    const coins = await getCoins(userId);
    embeds.push(
      new EmbedBuilder()
        .setTitle("🎉 当選結果")
        .setDescription(buffer)
        .setColor(0xffd700)
        .setFooter({
          text: `💰 合計当選金額: ${totalPrize.toLocaleString()} | 💎 現在の所持金: ${coins.toLocaleString()}`
        })
    );
  }

  await updateCoins(userId, totalPrize);

  for (const embed of embeds) {
    await interaction.followUp({ embeds: [embed] });
  }
}
