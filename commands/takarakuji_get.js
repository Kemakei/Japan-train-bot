import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("takarakuji_get")
  .setDescription("購入した宝くじの結果を確認します");

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

  for (const purchase of purchases) {
    const { number, letter, drawId } = purchase;
    const result = await drawResultsCol.findOne({ drawId });

    if (!result) {
      ephemeralLines.push(`🎟 ${number}${letter} → ⏳ まだ抽選結果は出ていません`);
      remainingPurchases.push(purchase);
      continue;
    }

    await lotteryCol.updateOne(
      { userId },
      { $pull: { purchases: { drawId } } }
    );

    const { number: drawNumber, letter: drawLetter } = result;
    let line;
    let prizeAmount = 0;

    const drawNumInt = parseInt(drawNumber, 10);
    const purchaseNumInt = parseInt(number, 10);

    if (number === drawNumber && letter === drawLetter) {
      prizeAmount = 1000000000;
      line = `🎟 ${number}${letter} → 🏆 1等！💰 ${prizeAmount}コイン獲得！`;
    } else if ((purchaseNumInt === drawNumInt - 1 || purchaseNumInt === drawNumInt + 1) && letter === drawLetter) {
      prizeAmount = 100000000;
      line = `🎟 ${number}${letter} → 🏆 前後賞！💰 ${prizeAmount}コイン獲得！`;
    } else if (number === drawNumber) {
      prizeAmount = 500000000;
      line = `🎟 ${number}${letter} → 🏆 2等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number.slice(1) === drawNumber.slice(1) && letter === drawLetter) {
      prizeAmount = 10000000;
      line = `🎟 ${number}${letter} → 🏆 4等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number.slice(1) === drawNumber.slice(1)) {
      prizeAmount = 5000000;
      line = `🎟 ${number}${letter} → 🏆 5等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number.slice(2) === drawNumber.slice(2) && letter === drawLetter) {
      prizeAmount = 3000000;
      line = `🎟 ${number}${letter} → 🏆 6等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number.slice(2) === drawNumber.slice(2)) {
      prizeAmount = 1000000;
      line = `🎟 ${number}${letter} → 🏆 7等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number.slice(3) === drawNumber.slice(3) && letter === drawLetter) {
      prizeAmount = 500000;
      line = `🎟 ${number}${letter} → 🏆 8等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number.slice(3) === drawNumber.slice(3)) {
      prizeAmount = 100000;
      line = `🎟 ${number}${letter} → 🏆 9等！💰 ${prizeAmount}コイン獲得！`;
    } else if (letter === drawLetter) {
      prizeAmount = 10000;
      line = `🎟 ${number}${letter} → 🏆 10等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number.slice(4) === drawNumber.slice(4)) {
      prizeAmount = 5000;
      line = `🎟 ${number}${letter} → 🏆 11等！💰 ${prizeAmount}コイン獲得！`;
    } else {
      line = `🎟 ${number}${letter} → ❌ 残念、ハズレ…`;
    }

    if (prizeAmount > 0) await updateCoins(userId, prizeAmount);
    publicLines.push(line);
  }

  await lotteryCol.updateOne(
    { userId },
    { $set: { purchases: remainingPurchases } },
    { upsert: true }
  );

  // Embed自動分割関数
  function createEmbedsByLine(lines, title, color = 0x00AE86) {
    const embeds = [];
    let chunk = "";

    for (const line of lines) {
      if ((chunk + line + "\n").length > 4000) { // 4096を安全圏内に調整
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

  // 公開結果を送信
  if (publicLines.length > 0) {
    const publicEmbeds = createEmbedsByLine(publicLines, "🎉 抽選結果");
    for (const embed of publicEmbeds) {
      await interaction.followUp({ embeds: [embed] });
    }
  }

  // 未抽選の結果を送信（ephemeral）
  if (ephemeralLines.length > 0) {
    const ephemeralEmbeds = createEmbedsByLine(ephemeralLines, "⏳ 未公開の抽選", 0xAAAAAA);
    for (const embed of ephemeralEmbeds) {
      await interaction.followUp({ embeds: [embed], flags: 64 });
    }
  }
}
