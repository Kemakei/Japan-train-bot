for (const purchase of purchases) {
  const { number, letter, drawId } = purchase;
  const result = await drawResultsCol.findOne({ drawId });

  if (!result) {
    messageLines.push(`🎟 ${number}${letter} (❌ まだ結果が公開されていません。)`);
    remainingPurchases.push(purchase); // 結果未公開は残す
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

  if (prizeAmount > 0) {
    await client.updateCoins(userId, prizeAmount);
  }

  messageLines.push(`🎟 ${number}${letter} 🏆 ${prizeResult}${prizeAmount > 0 ? ` 💰 ${prizeAmount}コイン` : ''}`);
  // ✅ 当選も外れも確認したら削除するので remainingPurchases に入れない
}
