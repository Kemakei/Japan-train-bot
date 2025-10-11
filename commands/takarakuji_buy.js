import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("takarakuji_get")
  .setDescription("購入した宝くじの当たり結果を確認します");

export async function execute(interaction) {
  const userId = interaction.user.id;
  const { lotteryCol, db, updateCoins } = interaction.client;

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

  const drawResultsCol = db.collection("drawResults");
  const publicLines = [];
  const ephemeralLines = [];
  const remainingPurchases = [];

  // --- 非同期で一括処理 ---
  await Promise.all(purchases.map(async (purchase) => {
    const { number, letter, drawId, isWin, prize, claimed } = purchase;

    const result = await drawResultsCol.findOne({ drawId });
    if (!result) {
      ephemeralLines.push(`🎟 ${number}${letter} → ⏳ まだ抽選結果は出ていません`);
      remainingPurchases.push(purchase);
      return;
    }

    if (isWin && !claimed) {
      let line = "";
      const prizeAmount = prize;
      switch (prizeAmount) {
        case 1000000000: line = `🎟 ${number}${letter} → 🏆 1等！💰 ${prizeAmount}コイン獲得！`; break;
        case 500000000:  line = `🎟 ${number}${letter} → 🏆 2等！💰 ${prizeAmount}コイン獲得！`; break;
        case 100000000:  line = `🎟 ${number}${letter} → 🏆 前後賞！💰 ${prizeAmount}コイン獲得！`; break;
        case 10000000:   line = `🎟 ${number}${letter} → 🏆 4等！💰 ${prizeAmount}コイン獲得！`; break;
        case 5000000:    line = `🎟 ${number}${letter} → 🏆 5等！💰 ${prizeAmount}コイン獲得！`; break;
        case 3000000:    line = `🎟 ${number}${letter} → 🏆 6等！💰 ${prizeAmount}コイン獲得！`; break;
        case 1000000:    line = `🎟 ${number}${letter} → 🏆 7等！💰 ${prizeAmount}コイン獲得！`; break;
        case 500000:     line = `🎟 ${number}${letter} → 🏆 8等！💰 ${prizeAmount}コイン獲得！`; break;
        case 100000:     line = `🎟 ${number}${letter} → 🏆 9等！💰 ${prizeAmount}コイン獲得！`; break;
        case 10000:      line = `🎟 ${number}${letter} → 🏆 10等！💰 ${prizeAmount}コイン獲得！`; break;
        case 5000:       line = `🎟 ${number}${letter} → 🏆 11等！💰 ${prizeAmount}コイン獲得！`; break;
        default: line = `🎟 ${number}${letter} → 🏆 当たり！💰 ${prizeAmount}コイン獲得！`;
      }

      publicLines.push(line);
      await updateCoins(userId, prizeAmount);

      await lotteryCol.updateOne(
        { userId },
        { $pull: { purchases: { number, letter, drawId } } }
      );
    } else {
      remainingPurchases.push(purchase);
    }
  }));

  // --- 残りの購入履歴を更新 ---
  await lotteryCol.updateOne(
    { userId },
    { $set: { purchases: remainingPurchases } },
    { upsert: true }
  );

  // --- Embed自動分割関数 ---
  function createEmbedsByLine(lines, title, color = 0x00AE86) {
    const embeds = [];
    let chunk = "";

    for (const line of lines) {
      if ((chunk + line + "\n").length > 4000) {
        embeds.push(
          new EmbedBuilder()
            .setTitle(title)
            .setDescription(chunk)
            .setColor(color)
        );
        chunk = "";
      }
      chunk += line + "\n";
    }

    if (chunk.length > 0) {
      embeds.push(
        new EmbedBuilder()
          .setTitle(title)
          .setDescription(chunk)
          .setColor(color)
      );
    }

    return embeds;
  }

  // --- 公開結果（当たり）送信 ---
  if (publicLines.length > 0) {
    const publicEmbeds = createEmbedsByLine(publicLines, "🎉 当たり結果");
    for (const embed of publicEmbeds) {
      await interaction.followUp({ embeds: [embed] });
    }
  }

  // --- 未公開の抽選結果送信（ephemeral） ---
  if (ephemeralLines.length > 0) {
    const ephemeralEmbeds = createEmbedsByLine(ephemeralLines, "⏳ 未公開の抽選", 0xAAAAAA);
    for (const embed of ephemeralEmbeds) {
      await interaction.followUp({ embeds: [embed], flags: 64 });
    }
  }
}
