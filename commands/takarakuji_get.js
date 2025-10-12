import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("takarakuji_get")
  .setDescription("購入した宝くじの当選結果を確認します");

export async function execute(interaction) {
  const userId = interaction.user.id;
  const { lotteryCol, updateCoins } = interaction.client;

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

  const winLines = [];
  const remainingPurchases = [];
  let totalPrize = 0;
  let pendingCount = 0;

  for (const t of purchases) {
    const { number, letter, isWin, prize, rank, claimed } = t;

    if (!t.drawId) {
      pendingCount++;
      remainingPurchases.push(t);
      continue;
    }

    if (isWin && !claimed) {
      const line = `🎟 ${number}${letter} → 🏆 **${rank}等！** 💰 ${prize.toLocaleString()}コイン獲得！`;
      winLines.push(line);
      totalPrize += prize;
      t.claimed = true;
    } else if (!isWin && !claimed) {
      // 外れは破棄
      continue;
    } else {
      remainingPurchases.push(t);
    }
  }

  await lotteryCol.updateOne(
    { userId },
    { $set: { purchases: remainingPurchases } },
    { upsert: true }
  );

  if (totalPrize > 0) await updateCoins(userId, totalPrize);

  const createEmbeds = (lines, title, color = 0xFFD700) => {
    const embeds = [];
    let chunk = "";

    for (const line of lines) {
      if ((chunk + line + "\n").length > 4000) {
        embeds.push(new EmbedBuilder().setTitle(title).setDescription(chunk).setColor(color));
        chunk = "";
      }
      chunk += line + "\n";
    }

    if (chunk.length > 0) {
      embeds.push(new EmbedBuilder().setTitle(title).setDescription(chunk).setColor(color));
    }

    return embeds;
  };

  const embeds = [];

  if (winLines.length > 0) embeds.push(...createEmbeds(winLines, "🎉 当選結果"));
  if (pendingCount > 0) embeds.push(new EmbedBuilder().setTitle("⏳ 未抽選チケット").setDescription(`現在 **${pendingCount}枚** のチケットはまだ抽選結果が公開されていません。`).setColor(0xAAAAAA));

  if (embeds.length > 0) {
    await Promise.all(embeds.map(embed => interaction.followUp({ embeds: [embed] })));
  } else {
    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setTitle("📭 当選結果なし")
          .setDescription("当選したチケットはありませんでした。")
          .setColor(0x888888)
      ]
    });
  }
}
