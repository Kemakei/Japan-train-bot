import { SlashCommandBuilder } from 'discord.js';
import { getLatestDrawId } from '../utils/draw.js'; // 変更

export const data = new SlashCommandBuilder()
  .setName('takarakuji_get')
  .setDescription('購入した宝くじの当選確認＆当選金入手');

export async function execute(interaction, { client }) {
  const userId = interaction.user.id;
  const purchases = await client.getTakarakujiPurchases(userId);

  if (!purchases || purchases.length === 0) {
    return interaction.reply({ content: '❌ 購入履歴がありません。', flags: 64 });
  }

  const drawResultsCol = client.db.collection("drawResults");
  const messageLines = [];
  const remainingPurchases = []; // 当選未確認や未公開のものを残す

  for (const purchase of purchases) {
    const { number, letter, drawId } = purchase;
    const result = await drawResultsCol.findOne({ drawId });

    if (!result) {
      remainingPurchases.push(purchase); // 未公開のものは残す
      messageLines.push(`🎟 ${number}${letter} (❌ まだ結果が公開されていません。)`);
      continue;
    }

    const { number: drawNumber, letter: drawLetter } = result;
    const results = [
      number === drawNumber && letter === drawLetter ? '1等 🎉' : null,
      number === drawNumber ? '2等 🥳' : null,
      number.slice(1) === drawNumber.slice(1) && letter === drawLetter ? '3等 🎊' : null,
      number.slice(2) === drawNumber.slice(2) ? '4等 🎉' : null,
      number.slice(3) === drawNumber.slice(3) && letter === drawLetter ? '5等 🎉' : null,
      letter === drawLetter ? '6等 🎉' : null,
      number.slice(4) === drawNumber.slice(4) ? '7等 🎉' : null,
    ];

    const prizeResult = results.filter(Boolean)[0] || '残念、ハズレ 😢';
    const prizeAmounts = { '1等 🎉':1000000, '2等 🥳':750000, '3等 🎊':500000, '4等 🎉':300000, '5等 🎉':100000, '6等 🎉':50000, '7等 🎉':10000 };
    const prizeAmount = prizeAmounts[prizeResult] || 0;

    if (prizeAmount > 0 && !purchase.claimed) {
      await client.updateCoins(userId, prizeAmount);
      purchase.claimed = true;
    }

    // 当選・受取済みのものは履歴から削除
    if (!purchase.claimed) remainingPurchases.push(purchase);

    messageLines.push(`🎟 ${number}${letter} 🏆 ${prizeResult}${prizeAmount > 0 ? ` 💰 ${prizeAmount}コイン` : ''}`);
  }

  // 更新: 残った購入履歴だけ残す
  await client.lotteryCol.updateOne(
    { userId },
    { $set: { purchases: remainingPurchases } }
  );

  const hasResults = messageLines.some(line => !line.includes('まだ結果が公開されていません'));
  await interaction.reply({
    content: messageLines.join('\n'),
    flags: hasResults ? undefined : 64
  });
}
