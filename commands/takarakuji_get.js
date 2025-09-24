import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('takarakuji_get')
  .setDescription('購入した宝くじの結果を確認します');

export async function execute(interaction) {
  const userId = interaction.user.id;
  const { lotteryCol, db, updateCoins } = interaction.client;

  // 🔹 最初にdeferReply (ephemeral扱いにする)
  await interaction.deferReply({ flags: 64 });

  // 購入履歴を取得
  const purchasesDoc = await lotteryCol.findOne({ userId });
  const purchases = purchasesDoc?.purchases || [];

  if (purchases.length === 0) {
    return interaction.editReply({ content: '❌ 購入履歴がありません', flags: 64 });
  }

  const drawResultsCol = db.collection("drawResults");
  const messageLines = [];
  const remainingPurchases = [];

  for (const purchase of purchases) {
    const { number, letter, drawId } = purchase;
    const result = await drawResultsCol.findOne({ drawId });

    if (!result) {
      // 抽選前 → 残す & 個別にephemeral通知
      remainingPurchases.push(purchase);
      await interaction.followUp({
        content: `🎟 ${number}${letter} → ⏳ まだ抽選結果は出ていません`,
        flags: 64
      });
      continue;
    }

    // 抽選済み → DBから削除
    await lotteryCol.updateOne(
      { userId },
      { $pull: { purchases: { drawId } } }
    );

    const { number: drawNumber, letter: drawLetter } = result;
    let line;
    let prizeAmount = 0;

    if (number === drawNumber && letter === drawLetter) {
      prizeAmount = 1000000;
      await updateCoins(userId, prizeAmount);
      line = `🎟 ${number}${letter} → 🏆 1等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number === drawNumber) {
      prizeAmount = 750000;
      await updateCoins(userId, prizeAmount);
      line = `🎟 ${number}${letter} → 🏆 2等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number.slice(1) === drawNumber.slice(1) && letter === drawLetter) {
      prizeAmount = 500000;
      await updateCoins(userId, prizeAmount);
      line = `🎟 ${number}${letter} → 🏆 3等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number.slice(2) === drawNumber.slice(2)) {
      prizeAmount = 300000;
      await updateCoins(userId, prizeAmount);
      line = `🎟 ${number}${letter} → 🏆 4等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number.slice(3) === drawNumber.slice(3) && letter === drawLetter) {
      prizeAmount = 100000;
      await updateCoins(userId, prizeAmount);
      line = `🎟 ${number}${letter} → 🏆 5等！💰 ${prizeAmount}コイン獲得！`;
    } else if (letter === drawLetter) {
      prizeAmount = 10000;
      await updateCoins(userId, prizeAmount);
      line = `🎟 ${number}${letter} → 🏆 6等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number.slice(4) === drawNumber.slice(4)) {
      prizeAmount = 5000;
      await updateCoins(userId, prizeAmount);
      line = `🎟 ${number}${letter} → 🏆 7等！💰 ${prizeAmount}コイン獲得！`;
    } else {
      line = `🎟 ${number}${letter} → ❌ 残念、ハズレ…`;
    }

    messageLines.push(line);
  }

  // 抽選前の購入だけ再保存
  await lotteryCol.updateOne(
    { userId },
    { $set: { purchases: remainingPurchases } },
    { upsert: true }
  );

  // 当選・ハズレ結果があれば公開
  if (messageLines.length > 0) {
    await interaction.followUp({
      content: messageLines.join('\n'),
      flags: 0 // 公開
    });
  }

  // 最初のdeferReplyを消す
  await interaction.deleteReply().catch(() => {});
}
