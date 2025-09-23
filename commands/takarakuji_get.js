import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('takarakuji_get')
  .setDescription('購入した宝くじの当選確認＆当選金入手');

export async function execute(interaction, { client }) {
  const userId = interaction.user.id;
  const purchases = await client.getTakarakujiPurchases(userId);

  if (!purchases || purchases.length === 0) {
    return interaction.reply({ content: '❌ 購入履歴がありません。', flags: 64 });
  }

  const now = new Date();
  let messageLines = [];
  let anyClaimed = false;

  for (let i = 0; i < purchases.length; i++) {
    const purchase = purchases[i];

    if (!purchase.drawNumber || !purchase.drawLetter) {
      messageLines.push(`🎟 ${purchase.number}${purchase.letter}: ❌ まだ結果が確定していません。次の更新後に判定可能です。`);
      continue;
    }

    const { number, letter, drawNumber, drawLetter } = purchase;

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

    if (prizeAmount > 0) await client.updateCoins(userId, prizeAmount);
    anyClaimed = true;

    // MongoDB から削除
    await client.lotteryCol.updateOne(
      { userId },
      { $pull: { purchases: { number: purchase.number, letter: purchase.letter } } }
    );

    messageLines.push(`🎟 ${number}${letter}: 🏆 ${prizeResult}${prizeAmount > 0 ? ` 💰 ${prizeAmount}コイン` : ''}`);
  }

  await interaction.reply({
    content: messageLines.join('\n'),
    flags: anyClaimed ? 0 : 64
  });
}
