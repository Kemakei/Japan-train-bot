import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('money')
  .setDescription('あなたの所持金等を確認します');

// -------------------- 数字フォーマット関数 --------------------
function formatCoins(amount) {
  if (amount >= 1_0000_0000_0000) return Math.floor(amount / 1_0000_0000_0000) + '兆' + (amount % 1_0000_0000_0000 !== 0 ? (amount % 1_0000_0000_0000 / 1_0000_0000_000).toFixed(1) + '兆' : '');
  if (amount >= 1_0000_0000) return Math.floor(amount / 1_0000_0000) + '億' + (amount % 1_0000_0000 !== 0 ? (amount % 1_0000_0000 / 1_0000_0000).toFixed(1) + '億' : '');
  if (amount >= 1_0000) return Math.floor(amount / 1_0000) + '万' + (amount % 1_0000 !== 0 ? (amount % 1_0000 / 1_0000).toFixed(1) + '万' : '');
  return amount.toString();
}

export async function execute(interaction) {
  try {
    const userId = interaction.user.id;
    const client = interaction.client;

    // -------------------- ユーザーデータ取得 --------------------
    const userDataDoc = await client.coinsCol.findOne({ userId });
    const coins = userDataDoc?.coins || 0;
    const VIPCoins = userDataDoc?.VIPCoins || 0;
    const stocks = userDataDoc?.stocks || 0;
    const lotteryCount = userDataDoc?.lotteryCount || 0;

    // -------------------- ヘッジ契約確認 --------------------
    const hedgeDoc = await client.getHedge(userId);
    let hedgeAccumulated = 0;

    if (hedgeDoc) {
      const now = new Date();
      const jstOffset = 9 * 60;
      const nowJST = new Date(now.getTime() + jstOffset * 60 * 1000);

      const lastUpdate = new Date(hedgeDoc.lastUpdateJST || nowJST.getTime());
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysPassed = Math.floor((nowJST.getTime() - lastUpdate.getTime()) / msPerDay);

      hedgeAccumulated = hedgeDoc.accumulated + hedgeDoc.amountPerDay * daysPassed;

      if (daysPassed > 0) {
        await client.updateCoins(userId, hedgeDoc.amountPerDay * daysPassed);
        hedgeDoc.accumulated = 0;
        hedgeDoc.lastUpdateJST = nowJST.getTime();
        await client.setHedge(userId, hedgeDoc);
      }
    }

    // -------------------- 借金情報取得 --------------------
    const loans = await client.db.collection("loans").find({ userId, paid: false }).toArray();
    let totalDebt = 0;
    let loanDetails = '';
    const now = Date.now();

    if (loans.length > 0) {
      for (const loan of loans) {
        totalDebt += loan.totalDue;
        loanDetails += `\n- 借入: ${formatCoins(loan.principal)} コイン | 利息込: ${formatCoins(loan.totalDue)} コイン | 日数: ${loan.daysPassed} 日 | 期限: <t:${Math.floor(loan.dueTime/1000)}:D>`;
      }
    }

    // -------------------- Embed作成 --------------------
    const embed = new EmbedBuilder()
      .setColor('Green')
      .setDescription(
        `**あなたの所持金: ${formatCoins(coins)} コイン**` +
        `\n**金コイン: ${formatCoins(VIPCoins)} コイン**` +
        `\n**保有株数: ${stocks} 株**` +
        `\n**宝くじ保有枚数: ${lotteryCount} 枚**` +
        (hedgeAccumulated > 0 ? `\n**契約中の保険金: ${formatCoins(hedgeAccumulated)} コイン（次回加算済み）**` : '') +
        (totalDebt > 0 ? `\n**借金合計: ${formatCoins(totalDebt)} コイン**${loanDetails}` : '')
      );

    await interaction.reply({ embeds: [embed] });

  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("❌ 所持金確認中にエラーが発生しました");
    } else {
      await interaction.reply({ content: "❌ 所持金確認中にエラーが発生しました", flags: 64 });
    }
  }
}
