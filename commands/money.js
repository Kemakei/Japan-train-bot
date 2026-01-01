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

  // -------------------- Embed --------------------
  const embed = new EmbedBuilder()
    .setColor(userId === interaction.user.id ? 'Green' : 'Blue')
    .setTitle(`${targetUser.tag} の資産`)
    .setDescription(
      `**所持金:** ${formatCoins(coins)}\n` +
      `**金コイン:** ${formatCoins(VIPCoins)}\n\n` +

      `**保有株:**\n${stockInfo}\n\n` +

      `**株評価額合計:** ${formatCoins(stockTotalValue)}\n` +
      `**総資産:** ${formatCoins(totalAssets)}\n\n` +

      `**宝くじ保有枚数:** ${tickets.length} 枚`
    )
    .setThumbnail(targetUser.displayAvatarURL({ extension: 'png', size: 256 }))
    .setFooter({ text: '株評価額は現在価格ベース' });

  await interaction.editReply({ embeds: [embed] });
}
