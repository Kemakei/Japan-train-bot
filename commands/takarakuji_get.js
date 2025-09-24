import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('takarakuji_get')
  .setDescription('購入した宝くじの結果を確認します');

export async function execute(interaction) {
  const userId = interaction.user.id;
  const { lotteryCol, db, updateCoins } = interaction.client;

  // 購入履歴を取得
  const purchasesDoc = await lotteryCol.findOne({ userId });
  const purchases = purchasesDoc?.purchases || [];

  if (purchases.length === 0) {
    return interaction.reply({ content: '❌ 購入履歴がありません', ephemeral: true });
  }

  const drawResultsCol = db.collection("drawResults");
  const messageLines = [];
  const remainingPurchases = [];

  for (const purchase of purchases) {
    const { number, letter, drawId } = purchase;
    const result = await drawResultsCol.findOne({ drawId });

    if (!result) {
      // 抽選前 → 残す
      remainingPurchases.push(purchase);
      messageLines.push(`🎟 ${number}${letter} → ⏳ まだ抽選結果は出ていません`);
      continue;
    }

    // 抽選済み → 削除＆結果確認
    await lotteryCol.updateOne(
      { userId },
      { $pull: { purchases: { drawId } } }
    );

    const { number: drawNumber, letter: drawLetter } = result;
    let line;
    let prizeAmount = 0;

    // 当選判定（例：1等～7等）
    if (number === drawNumber && letter === drawLetter) {
      prizeAmount = 1000000; // 1等
      await updateCoins(userId, prizeAmount);
      line = `🎟 ${number}${letter} → 🏆 1等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number === drawNumber) {
      prizeAmount = 750000; // 2等
      await updateCoins(userId, prizeAmount);
      line = `🎟 ${number}${letter} → 🏆 2等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number.slice(1) === drawNumber.slice(1) && letter === drawLetter) {
      prizeAmount = 500000; // 3等
      await updateCoins(userId, prizeAmount);
      line = `🎟 ${number}${letter} → 🏆 3等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number.slice(2) === drawNumber.slice(2)) {
      prizeAmount = 300000; // 4等
      await updateCoins(userId, prizeAmount);
      line = `🎟 ${number}${letter} → 🏆 4等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number.slice(3) === drawNumber.slice(3) && letter === drawLetter) {
      prizeAmount = 100000; // 5等
      await updateCoins(userId, prizeAmount);
      line = `🎟 ${number}${letter} → 🏆 5等！💰 ${prizeAmount}コイン獲得！`;
    } else if (letter === drawLetter) {
      prizeAmount = 50000; // 6等
      await updateCoins(userId, prizeAmount);
      line = `🎟 ${number}${letter} → 🏆 6等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number.slice(4) === drawNumber.slice(4)) {
      prizeAmount = 10000; // 7等
      await updateCoins(userId, prizeAmount);
      line = `🎟 ${number}${letter} → 🏆 7等！💰 ${prizeAmount}コイン獲得！`;
    } else {
      line = `🎟 ${number}${letter} → ❌ 残念、ハズレ…`;
    }

    messageLines.push(line);
  }

  // 抽選前の購入だけを再保存
  await lotteryCol.updateOne(
    { userId },
    { $set: { purchases: remainingPurchases } },
    { upsert: true }
  );

  await interaction.reply({
    content: messageLines.join('\n'),
    ephemeral: true
  });
}
