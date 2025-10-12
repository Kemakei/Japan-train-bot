import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("leverage")
  .setDescription("銀行からお金を借りたり返済します")
  .addSubcommand(sub =>
    sub.setName("borrow")
      .setDescription("指定金額を借ります")
      .addIntegerOption(opt => 
        opt.setName("amount")
          .setDescription("借りる金額")
          .setRequired(true)
      ))
  .addSubcommand(sub =>
    sub.setName("repay")
      .setDescription("所持コインから借金を返済します"));

export async function execute(interaction) {
  try {
    const userId = interaction.user.id;
    const client = interaction.client;

    if (interaction.options.getSubcommand() === "borrow") {

      // 未返済の借金があるか確認
      const existingLoans = await client.db.collection("loans").find({ userId, paid: false }).toArray();
      if (existingLoans.length > 0) {
        return interaction.reply({
          content: "❌ 返済していない借金が残っています。先に返済してください。",
          flags: 64
        });
      }

      const amount = interaction.options.getInteger("amount");

      // 借入額のバリデーション
      if (amount <= 0)
        return interaction.reply({ content: "❌ 正の金額を指定してください。", flags: 64 });
      if (amount > 1_000_000)
        return interaction.reply({ content: "⚠️ 最大借入金額は 1,000,000 コインです。", flags: 64 });

      const now = Date.now();
      const due = now + 7 * 24 * 60 * 60 * 1000; // 7日後
      const interestRate = 0.05;
      const totalDue = Math.floor(amount * (1 + interestRate)); // 初日に5%即時加算

      // データ登録
      await client.db.collection("loans").insertOne({
        userId,
        principal: amount,
        interestRate,
        startTime: now,
        daysPassed: 0,
        totalDue,
        dueTime: due,
        paid: false
      });

      // コイン増加
      await client.updateCoins(userId, amount);

      return interaction.reply({
        content:
          `💰 ${amount.toLocaleString()} コインを借りました。\n` +
          `初日の利息5%が加算され、返済総額は **${totalDue.toLocaleString()} コイン** です。\n` +
          `返済期限は7日後です。`,
        ephemeral: false
      });

    } else if (interaction.options.getSubcommand() === "repay") {

      const loans = await client.db.collection("loans").find({ userId, paid: false }).toArray();
      if (loans.length === 0)
        return interaction.reply({ content: "✅ 返済すべき借金はありません。", flags: 64 });

      let coins = await client.getCoins(userId);
      let totalRepaid = 0;
      const now = Date.now();

      for (const loan of loans) {

        // 期限切れ自動回収
        if (now >= loan.dueTime) {
          let remaining = loan.totalDue;

          // 1. 所持コインから回収
          const repayFromCoins = Math.min(coins, remaining);
          coins -= repayFromCoins;
          remaining -= repayFromCoins;
          totalRepaid += repayFromCoins;

          // 2. 株を売却して不足分回収
          if (remaining > 0) {
            const stockAmount = (await client.getUserData(userId)).stocks || 0;
            const stockPrice = await client.getStockPrice();
            const maxSellCoins = stockAmount * stockPrice;
            const sellAmount = Math.min(maxSellCoins, remaining);
            if (sellAmount > 0) {
              const sellStocks = Math.floor(sellAmount / stockPrice);
              await client.updateStocks(userId, -sellStocks);
              coins += sellAmount;
              remaining -= sellAmount;
              totalRepaid += sellAmount;
            }
          }

          // 3. 保険金から回収
          if (remaining > 0) {
            const hedge = await client.getHedge(userId);
            if (hedge) {
              const hedgeCoins = hedge.accumulated || 0;
              const take = Math.min(hedgeCoins, remaining);
              remaining -= take;
              totalRepaid += take;
              hedge.accumulated -= take;
              if (hedge.accumulated <= 0) {
                await client.clearHedge(userId);
              } else {
                await client.setHedge(userId, hedge);
              }
            }
          }

          // 4. それでも残れば所持コインを0に
          if (remaining > 0) {
            coins = 0;
            totalRepaid += remaining;
          }

          await client.db.collection("loans").updateOne(
            { _id: loan._id },
            { $set: { paid: true } }
          );

        } else {
          // 通常返済処理（所持コインのみ）
          const repayAmount = Math.min(loan.totalDue, coins);
          if (repayAmount <= 0) continue;

          coins -= repayAmount;
          totalRepaid += repayAmount;

          if (repayAmount >= loan.totalDue) {
            await client.db.collection("loans").updateOne(
              { _id: loan._id },
              { $set: { paid: true } }
            );
          } else {
            const remainingPrincipal = Math.floor(loan.totalDue - repayAmount);
            await client.db.collection("loans").updateOne(
              { _id: loan._id },
              {
                $set: {
                  principal: remainingPrincipal,
                  startTime: now,
                  daysPassed: 0,
                  totalDue: remainingPrincipal
                }
              }
            );
          }
        }
      }

      await client.setCoins(userId, coins);
      return interaction.reply({
        content: `💸 自動徴収・返済合計: ${totalRepaid.toLocaleString()} コイン`,
        ephemeral: false
      });
    }

  } catch (err) {
    console.error(err);
    await interaction.reply({
      content: "❌ 処理中にエラーが発生しました。",
      flags: 64
    });
  }
}
