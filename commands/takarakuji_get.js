import { SlashCommandBuilder } from 'discord.js';

// 宝くじの結果チェック関数
async function checkLotteryResults(userId, purchasesCol, drawResultsCol, client) {
  const purchases = await purchasesCol.find({ userId }).toArray();
  const messageLines = [];
  const remainingPurchases = [];

  for (const purchase of purchases) {
    const { number, letter, drawId, _id } = purchase;
    const result = await drawResultsCol.findOne({ drawId });

    if (!result) {
      // 結果未公開 → 残す
      messageLines.push(`🎟 ${number}${letter} → ⏳ まだ抽選結果は出ていません`);
      remainingPurchases.push(purchase);
      continue;
    }

    // === 公開済みの場合: /takarakuji_get 実行で即削除 ===
    await purchasesCol.deleteOne({ _id });

    const { number: drawNumber, letter: drawLetter } = result;
    const results = [
      number === drawNumber && letter === drawLetter ? '1等' : null,
      number === drawNumber ? '2等' : null,
      number.slice(1) === drawNumber.slice(1) && letter === drawLetter ? '3等' : null,
      number.slice(2) === drawNumber.slice(2) ? '4等' : null,
      number.slice(3) === drawNumber.slice(3) && letter === drawLetter ? '5等' : null,
      letter === drawLetter ? '6等' : null,
      number.slice(4) === drawNumber.slice(4) ? '7等' : null,
    ];

    const prizeResult = results.find(Boolean) || null;
    const prizeAmounts = {
      '1等': 1000000,
      '2等': 750000,
      '3等': 500000,
      '4等': 300000,
      '5等': 100000,
      '6等': 50000,
      '7等': 10000
    };
    const prizeAmount = prizeResult ? prizeAmounts[prizeResult] : 0;

    if (prizeAmount > 0) {
      await client.updateCoins(userId, prizeAmount);
      messageLines.push(`🎟 ${number}${letter} → 🏆 ${prizeResult}！💰 ${prizeAmount}コイン獲得！`);
    } else {
      messageLines.push(`🎟 ${number}${letter} → 残念、外れ...`);
    }
  }

  // 未公開の購入だけ再保存
  await purchasesCol.deleteMany({ userId });
  if (remainingPurchases.length > 0) {
    await purchasesCol.insertMany(remainingPurchases);
  }

  return messageLines.length > 0
    ? messageLines.join('\n')
    : '🎟 現在、購入済みの宝くじはありません。';
}

// ==== SlashCommand定義 ====
export const data = new SlashCommandBuilder()
  .setName('takarakuji_get')
  .setDescription('購入した宝くじの結果を確認します');

export async function execute(interaction) {
  const userId = interaction.user.id;

  const message = await checkLotteryResults(
    userId,
    interaction.client.lotteryCol, // ← ここ
    interaction.client.db.collection("drawResults"), // ← ここ
    interaction.client
  );

  await interaction.reply(message);
}
