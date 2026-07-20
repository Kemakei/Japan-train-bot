export function scheduleDailyStockDividend(client) {

  async function payDividend() {

    console.log("💰 株式配当の支払い開始");

    // 株を持っているユーザー一覧
    const holders = await client.stockHistoryCol
      .find({
        userId: { $not: /^stock_price_|^trade_history_/ }
      })
      .toArray();

    for (const holder of holders) {

      const stocks = holder.stocks ?? {};

      let dividend = 0;

      for (const [stockId, amount] of Object.entries(stocks)) {

        if (amount <= 0) continue;

        const currentPrice = await client.getStockPrice(stockId);

        dividend += Math.floor(currentPrice * amount * 0.025);
      }

      if (dividend > 0) {
        await client.updateCoins(holder.userId, dividend);

        console.log(
          `💰 ${holder.userId} に配当 ${dividend} Coins 지급`
        );
      }
    }

    console.log("✅ 株式配当終了");
  }

  function schedule() {

    const now = new Date();

    // JST
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

    const next = new Date(jst);

    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);

    const delay =
      next.getTime() -
      jst.getTime();

    setTimeout(async () => {

      await payDividend();

      setInterval(payDividend, 24 * 60 * 60 * 1000);

    }, delay);

  }

  schedule();

}