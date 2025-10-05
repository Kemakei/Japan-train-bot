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

    // 数字を整数で扱う
    const drawNumInt = parseInt(drawNumber, 10);
    const purchaseNumInt = parseInt(number, 10);

    // 1等
    if (number === drawNumber && letter === drawLetter) {
      prizeAmount = 1000000000;
      line = `🎟 ${number}${letter} → 🏆 1等！💰 ${prizeAmount}コイン獲得！`;
    } 
    // 前後賞
    else if ((purchaseNumInt === drawNumInt - 1 || purchaseNumInt === drawNumInt + 1) && letter === drawLetter) {
      prizeAmount = 100000000; // 前後賞
      line = `🎟 ${number}${letter} → 🏆 前後賞！💰 ${prizeAmount}コイン獲得！`;
    } 
    // 2等: 番号全一致（文字不問）
    else if (number === drawNumber) {
      prizeAmount = 500000000;
      line = `🎟 ${number}${letter} → 🏆 2等！💰 ${prizeAmount}コイン獲得！`;
    } 
    // 下4桁＋文字一致 4等
    else if (number.slice(1) === drawNumber.slice(1) && letter === drawLetter) {
      prizeAmount = 10000000;
      line = `🎟 ${number}${letter} → 🏆 4等！💰 ${prizeAmount}コイン獲得！`;
    } 
    // 下4桁一致 5等
    else if (number.slice(1) === drawNumber.slice(1)) {
      prizeAmount = 5000000;
      line = `🎟 ${number}${letter} → 🏆 5等！💰 ${prizeAmount}コイン獲得！`;
    } 
    // 下3桁＋文字一致 6等
    else if (number.slice(2) === drawNumber.slice(2) && letter === drawLetter) {
      prizeAmount = 3000000;
      line = `🎟 ${number}${letter} → 🏆 6等！💰 ${prizeAmount}コイン獲得！`;
    } 
    // 下3桁一致 7等
    else if (number.slice(2) === drawNumber.slice(2)) {
      prizeAmount = 1000000;
      line = `🎟 ${number}${letter} → 🏆 7等！💰 ${prizeAmount}コイン獲得！`;
    } 
    // 下2桁＋文字一致 8等
    else if (number.slice(3) === drawNumber.slice(3) && letter === drawLetter) {
      prizeAmount = 500000;
      line = `🎟 ${number}${letter} → 🏆 8等！💰 ${prizeAmount}コイン獲得！`;
    } 
    // 下2桁一致 9等
    else if (number.slice(3) === drawNumber.slice(3)) {
      prizeAmount = 100000;
      line = `🎟 ${number}${letter} → 🏆 9等！💰 ${prizeAmount}コイン獲得！`;
    } 
    // 文字一致 10等
    else if (letter === drawLetter) {
      prizeAmount = 10000;
      line = `🎟 ${number}${letter} → 🏆 10等！💰 ${prizeAmount}コイン獲得！`;
    } 
    // 下1桁一致 11等
    else if (number.slice(4) === drawNumber.slice(4)) {
      prizeAmount = 5000;
      line = `🎟 ${number}${letter} → 🏆 11等！💰 ${prizeAmount}コイン獲得！`;
    } 
    // ハズレ
    else {
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

  function createEmbedsFromText(text, title, color = 0x00AE86) {
    const embeds = [];
    const chunks = text.match(/[\s\S]{1,4000}/g) || [];
    for (let i = 0; i < chunks.length; i++) {
      embeds.push(
        new EmbedBuilder()
          .setTitle(i === 0 ? title : `${title} (続き${i + 1})`)
          .setDescription(chunks[i])
          .setColor(color)
      );
    }
    return embeds;
  }

  if (publicLines.length > 0) {
    const publicEmbeds = createEmbedsFromText(publicLines.join("\n"), "🎉 抽選結果");
    for (let i = 0; i < publicEmbeds.length; i += 10) {
      await interaction.followUp({ embeds: publicEmbeds.slice(i, i + 10), flags: 0 });
    }
  }

  if (ephemeralLines.length > 0) {
    const ephemeralEmbeds = createEmbedsFromText(ephemeralLines.join("\n"), "⏳ 未公開の抽選", 0xAAAAAA);
    for (let i = 0; i < ephemeralEmbeds.length; i += 10) {
      await interaction.followUp({ embeds: ephemeralEmbeds.slice(i, i + 10), flags: 64 });
    }
  }
}
