import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('money')
  .setDescription('あなたの所持金等を確認します')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('確認したいユーザー')
      .setRequired(false) // 空白なら自分
  );

// -------------------- 数字フォーマット関数 --------------------
function formatCoins(amount) {
  let result = '';
  if (amount >= 1_0000_0000_0000) { 
    const cho = Math.floor(amount / 1_0000_0000_0000);
    amount %= 1_0000_0000_0000;
    result += `${cho}兆`;
  }
  if (amount >= 1_0000_0000) { 
    const oku = Math.floor(amount / 1_0000_0000);
    amount %= 1_0000_0000;
    result += `${oku}億`;
  }
  if (amount >= 1_0000) { 
    const man = Math.floor(amount / 1_0000);
    amount %= 1_0000;
    result += `${man}万`;
  }
  if (amount > 0) { 
    result += `${amount}`;
  }
  return result + 'コイン';
}

export async function execute(interaction) {
  try {
    const client = interaction.client;
    // メンションがある場合はそのID、なければ自分
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const userId = targetUser.id;

    // -------------------- ユーザーデータ取得 --------------------
    const userDataDoc = await client.coinsCol.findOne({ userId });
    const coins = userDataDoc?.coins || 0;
    const VIPCoins = userDataDoc?.VIPCoins || 0;
    const stocks = userDataDoc?.stocks || 0;

    // -------------------- 宝くじ保有枚数取得 --------------------
    const lotteryDoc = await client.lotteryCol.findOne({ userId }, { projection: { purchases: 1 } });
    const lotteryCount = lotteryDoc?.purchases?.length || 0;

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

    if (loans.length > 0) {
      for (const loan of loans) {
        totalDebt += loan.totalDue;
        loanDetails += `\n- 借入: ${formatCoins(loan.principal)} | 利息込: ${formatCoins(loan.totalDue)} | 日数: ${loan.daysPassed} 日 | 期限: <t:${Math.floor(loan.dueTime/1000)}:D>`;
      }
    }

    // -------------------- Embed作成 --------------------
    const embed = new EmbedBuilder()
      .setColor('Green')
      .setTitle(`${targetUser.tag} の所持金`)
      .setDescription(
        `**所持金: ${formatCoins(coins)}**` +
        `\n**金コイン: ${formatCoins(VIPCoins)}**` +
        `\n**保有株数: ${stocks} 株**` +
        `\n**宝くじ保有枚数: ${lotteryCount} 枚**` +
        (hedgeAccumulated > 0 ? `\n**契約中の保険金: ${formatCoins(hedgeAccumulated)}（次回加算済み）**` : '') +
        (totalDebt > 0 ? `\n**借金合計: ${formatCoins(totalDebt)}**${loanDetails}` : '')
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
