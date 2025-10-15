import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('money')
  .setDescription('あなた、または指定したユーザーの所持金等を確認します')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('確認したいユーザー（省略すると自分）')
      .setRequired(false)
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
  if (amount > 0 || result === '') result += `${amount}`;
  return result + 'コイン';
}

export async function execute(interaction) {
  try {
    // --- 初回応答を保留（flags:64でエフェメラル相当） ---
    await interaction.deferReply();

    const client = interaction.client;
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const userId = targetUser.id;

    // -------------------- ユーザーデータ取得 --------------------
    const userDataDoc = await client.coinsCol.findOne({ userId }) || {};
    const coins = userDataDoc.coins || 0;
    const VIPCoins = userDataDoc.VIPCoins || 0;
    const stocks = userDataDoc.stocks || 0;

   // -------------------- 宝くじ保有枚数取得（未確認のみ） --------------------
    const tickets = await client.lotteryTickets.find({ userId, claimed: false }).toArray();
    const unclaimedCount = tickets.length;
    // -------------------- ヘッジ契約確認 --------------------
    const hedgeDoc = await client.getHedge(userId);
    let hedgeAccumulated = 0;

    if (hedgeDoc) {
      const now = new Date();
      const jstOffset = 9 * 60 * 60 * 1000;
      const nowJST = new Date(now.getTime() + jstOffset);
      const lastUpdate = new Date(hedgeDoc.lastUpdateJST || nowJST.getTime());
      const daysPassed = Math.floor((nowJST.getTime() - lastUpdate.getTime()) / (24 * 60 * 60 * 1000));

      hedgeAccumulated = hedgeDoc.accumulated + hedgeDoc.amountPerDay * daysPassed;

      // 自分自身のデータのみ更新
      if (daysPassed > 0 && userId === interaction.user.id) {
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
        loanDetails += `\n- 借入: ${formatCoins(loan.principal)} | 利息込: ${formatCoins(loan.totalDue)} | 期限: <t:${Math.floor(loan.dueTime / 1000)}:D>`;
      }
    }

    // -------------------- Embed作成 --------------------
    const embed = new EmbedBuilder()
      .setColor(userId === interaction.user.id ? 'Green' : 'Blue')
      .setTitle(`${targetUser.tag} の所持金`)
      .setDescription(
        `**💰 所持金:** ${formatCoins(coins)}\n` +
        `**🏅 金コイン:** ${formatCoins(VIPCoins)}\n` +
        `**📈 保有株数:** ${stocks || 0} 株\n` +
        `**🎟️ 宝くじ保有枚数:** ${unclaimedCount || 0} 枚\n` +
        (hedgeAccumulated > 0 ? `**💼 保険金:** ${formatCoins(hedgeAccumulated)}\n` : '') +
        (totalDebt > 0 ? `**💸 借金:** ${formatCoins(totalDebt)}${loanDetails}` : '')
      )
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: userId === interaction.user.id ? 'あなたの資産情報' : `${targetUser.username} の情報を表示中` });

    // -------------------- Embed送信 --------------------
    await interaction.editReply({ embeds: [embed] });

  } catch (err) {
    console.error(err);
    try {
      await interaction.editReply({ content: "❌ 所持金確認中にエラーが発生しました。", embeds: [], flags: 64 });
    } catch {
      // deferされていない場合に備え
      await interaction.reply({ content: "❌ 所持金確認中にエラーが発生しました。", flags: 64 });
    }
  }
}
