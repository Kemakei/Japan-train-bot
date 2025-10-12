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
  const keptPurchases = [];

  for (const p of purchases) {
    // --- 未公開判定を効率化 ---
    if (!p.drawId || p.published === false) {
      keptPurchases.push(p);
      continue;
    }

    // 公開済みチケット
    if (!p.checked) {
      if (p.isWin) {
        publicLines.push(
          `🎟 ${p.number}${p.letter} → 🏆 ${p.rank}等 💰 ${p.prize.toLocaleString()}コイン獲得！`
        );
        totalPrize += p.prize;
        await updateCoins(userId, p.prize);
      }

      // 結果確認済みにマーク
      p.checked = true;
      keptPurchases.push(p);
    }
  }

  // DB更新（保持対象だけ残す）
  await lotteryCol.updateOne(
    { userId },
    { $set: { purchases: keptPurchases } },
    { upsert: true }
  );

  const coins = await getCoins(userId);

  // --- Embed 分割関数 ---
  const createEmbedsByLine = (lines, title, color = 0xFFD700) => {
    const embeds = [];
    let chunk = [];
    for (const line of lines) {
      const joined = [...chunk, line].join("\n");
      if (joined.length > 4000) {
        embeds.push(
          new EmbedBuilder()
            .setTitle(title)
            .setDescription(chunk.join("\n") + `\n\n合計当選金額: ${totalPrize.toLocaleString()}コイン\n残り所持金: ${coins.toLocaleString()}コイン`)
            .setColor(color)
        );
        chunk = [line];
      } else {
        chunk.push(line);
      }
    }
    if (chunk.length > 0) {
      embeds.push(
        new EmbedBuilder()
          .setTitle(title)
          .setDescription(chunk.join("\n") + `\n\n合計当選金額: ${totalPrize.toLocaleString()}コイン\n残り所持金: ${coins.toLocaleString()}コイン`)
          .setColor(color)
      );
    }
    return embeds;
  };

  // --- 公開済み当選チケットの表示（分割対応） ---
  if (publicLines.length > 0) {
    const publicEmbeds = createEmbedsByLine(publicLines, "🎉 当選結果");
    for (const embed of publicEmbeds) {
      await interaction.followUp({ embeds: [embed] });
    }
  }

  // --- 未公開チケットの表示 ---
  const keptUnpublished = keptPurchases.filter(p => !p.drawId || p.published === false);
  if (publicLines.length === 0 && keptUnpublished.length > 0) {
    const embed = new EmbedBuilder()
      .setTitle("⏳ 未公開の抽選")
      .setDescription(`未公開チケット: ${keptUnpublished.length}枚`)
      .setColor(0xAAAAAA);
    await interaction.followUp({ embeds: [embed], flags: 64 });
  }

  // --- 当選なし・未公開なし ---
  if (publicLines.length === 0 && keptUnpublished.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle("📭 当選結果なし")
      .setDescription(
        `当選したチケットはありませんでした。\n合計当選金額: ${totalPrize.toLocaleString()}コイン\n残り所持金: ${coins.toLocaleString()}コイン`
      )
      .setColor(0x888888);
    await interaction.followUp({ embeds: [embed] });
  }
}
