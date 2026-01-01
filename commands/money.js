import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('money')
  .setDescription('あなた、または指定したユーザーの所持金等を確認します')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('確認したいユーザー（省略すると自分）')
      .setRequired(false)
  );

// -------------------- 数字フォーマット --------------------
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

// -------------------- 株マスタ --------------------
const STOCKS = [
  { id: "A", name: "tootle株式会社" },
  { id: "B", name: "ハイシロソフト株式会社" },
  { id: "C", name: "バナナ株式会社" },
  { id: "D", name: "ネムーイ株式会社" },
  { id: "E", name: "ナニイッテンノー株式会社" },
  { id: "F", name: "ダカラナニー株式会社" },
  { id: "G", name: "ホシーブックス株式会社" },
  { id: "H", name: "ランランルー株式会社" },
];

export async function execute(interaction) {
  await interaction.deferReply();

  const client = interaction.client;
  const targetUser = interaction.options.getUser('user') || interaction.user;
  const userId = targetUser.id;

  // -------------------- 所持金 --------------------
  const coinDoc = await client.coinsCol.findOne({ userId }) || {};
  const coins = coinDoc.coins || 0;
  const VIPCoins = coinDoc.VIPCoins || 0;

  // -------------------- 保有株（ここが重要） --------------------
  const stockDoc = await client.db
    .collection("stock_history")
    .findOne({ userId });

  const stocks = stockDoc?.stocks || {};

  let stockTotalValue = 0;
  const stockLines = [];

  for (const [stockId, count] of Object.entries(stocks)) {
    if (count <= 0) continue;

    const stockName =
      STOCKS.find(s => s.id === stockId)?.name ?? stockId;

    const price = await client.getStockPrice(stockId);
    const totalValue = price * count;

    stockTotalValue += totalValue;

    stockLines.push(
      `${stockName}\n  ${count}株（総額： ${formatCoins(totalValue)}）`
    );
  }

  const stockInfo =
    stockLines.length > 0 ? stockLines.join('\n') : 'なし';

  // -------------------- 宝くじ --------------------
  const tickets = await client.lotteryTickets
    .find({ userId })
    .toArray();

  // -------------------- 総資産 --------------------
  const totalAssets = coins + stockTotalValue;

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

    // -------------------- 職業・才能・熟練度 --------------------
    const jobDoc = await client.db.collection("jobs").findOne({ userId });
    const jobName = jobDoc?.job || '無職';
    const skill = jobDoc?.skill ?? 0;
    const talent = jobDoc?.talent != null ? jobDoc.talent.toFixed(1) : '0';

    // -------------------- ライセンス取得 --------------------
    const licenseDoc = await client.db.collection("licenses").findOne({ userId });
    let obtainedLicenses = [];

    if (licenseDoc) {
      if (Array.isArray(licenseDoc.obtained)) {
        obtainedLicenses.push(...licenseDoc.obtained);
      }
      if (licenseDoc.licenses) {
        const licensesFromObj = Object.entries(licenseDoc.licenses)
          .filter(([_, v]) => v)
          .map(([k, _]) => k);
        obtainedLicenses.push(...licensesFromObj.filter(l => !obtainedLicenses.includes(l)));
      }
    }

  // -------------------- Embed --------------------
  const embed = new EmbedBuilder()
    .setColor(userId === interaction.user.id ? 'Green' : 'Blue')
    .setTitle(`${targetUser.tag} の資産`)
    .setDescription(
      `**所持金:** ${formatCoins(coins)}\n` +
      `**金コイン:** ${formatCoins(VIPCoins)}\n\n` +

      `**保有株:**\n${stockInfo}\n` +
      `**株評価額合計:** ${formatCoins(stockTotalValue)}\n` +
      `**総資産:** ${formatCoins(totalAssets)}\n\n` +

      `**宝くじ保有枚数:** ${tickets.length} 枚\n\n`
      `**職業:** ${jobName}\n` +
      `**熟練度:** ${skill}\n` +
      `**才能:** ${talent}\n` +
      `**取得ライセンス:** ${obtainedLicenses.length > 0 ? obtainedLicenses.join('、') : 'なし'}\n\n` +
        (hedgeAccumulated > 0 ? `**保険金:** ${formatCoins(hedgeAccumulated)}\n` : '') +
        (totalDebt > 0 ? `**借金:** ${formatCoins(totalDebt)}${loanDetails}` : '')
      )
    
    .setThumbnail(targetUser.displayAvatarURL({ extension: 'png', size: 256 }))
    .setFooter({ text: '株評価額は現在価格ベース' });

  await interaction.editReply({ embeds: [embed] });
}
