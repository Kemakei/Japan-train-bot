export async function updateLoansDaily(client) {
  const now = Date.now();
  const loans = await client.db.collection("loans").find({ paid: false }).toArray();

  for (const loan of loans) {
    const daysPassed = Math.floor((now - loan.startTime) / (1000 * 60 * 60 * 24));
    const totalDue = Math.floor(loan.principal * Math.pow(1 + loan.interestRate, daysPassed));

    await client.db.collection("loans").updateOne(
      { _id: loan._id },
      { $set: { daysPassed, totalDue } }
    );
  }

  console.log(`💾 ${loans.length} 件の借金データを更新しました (${new Date().toLocaleString()})`);
}

export function scheduleDailyLoanUpdate(client) {
  const now = new Date();
  const jstOffset = 9 * 60;
  const nowJST = new Date(now.getTime() + jstOffset * 60 * 1000);

  const nextMidnight = new Date(nowJST);
  nextMidnight.setHours(24, 0, 0, 0); // 翌日0時
  const delay = nextMidnight.getTime() - nowJST.getTime();

  setTimeout(() => {
    updateLoansDaily(client);
    setInterval(() => updateLoansDaily(client), 24 * 60 * 60 * 1000);
  }, delay);

  console.log(`🕒 次の借金データ更新は ${new Date(Date.now() + delay).toLocaleString()} に実行されます`);
}
