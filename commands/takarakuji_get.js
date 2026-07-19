import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getLatestDrawId } from "../utils/draw.js";

export const data = new SlashCommandBuilder()
  .setName("takarakuji_get")
  .setDescription("購入した宝くじの当選結果を確認します");

export async function execute(interaction) {
  const userId = interaction.user.id;
  const { lotteryTickets, updateCoins, getCoins, db } = interaction.client;

  await interaction.deferReply();

  // --- 公開済み抽選IDだけ取得 ---
  drawId: {
    $lte: latestDrawId
  }

  // --- 購入履歴をストリームで取得 ---
  const cursor = lotteryTickets.find({
    userId,
    claimed: false
},
    {
        projection: {
            number: 1,
            letter: 1,
            prize: 1,
            rank: 1,
            drawId: 1,
            isWin: 1,
            claimed: 1
        }
    }
).batchSize(5000);


  let hasPurchase = false; 
  let totalPrize = 0;
  let winCount = 0;
  const publicLines = [];
  const lowRankWins = {};
  let unpublishedCount = 0;
  let deleteOps = [];
  const deleteIds = [];

  for await (const p of cursor) {
    hasPurchase = true;
    const isUnpublished = !p.drawId || !publishedDrawIds.has(p.drawId);

    if (isUnpublished) {
      remainingPurchases.push(p);
      continue;
    }

if (p.isWin && !p.claimed) {
  totalPrize += p.prize;
  winCount++;

  if (p.rank <= 3) {
    const line = `🎟 ${p.number}${p.letter} → 🏆 ${p.rank}等 💰 ${p.prize.toLocaleString()}コイン獲得！`;

    if (publicLines.length < 100) {
      publicLines.push(line);
    } else if (publicLines.length === 100) {
      publicLines.push("他省略");
    }
  } else {
    if (!lowRankWins[p.rank]) {
      lowRankWins[p.rank] = {
        count: 0,
        prize: p.prize
      };
    }

    lowRankWins[p.rank].count++;
  }

  deleteIds.push(p._id);({ deleteOne: { filter: { _id: p._id } } });
    } else if (!p.isWin) {
      deleteIds.push(p._id);({ deleteOne: { filter: { _id: p._id } } });
    } else {
      remainingPurchases.push(p);
    }

    // 🔹 2万件ごとに一括削除
    if (deleteIds.length) {
    await lotteryTickets.deleteMany({
        _id: {
            $in: deleteIds
        }
    });
}
  }

  // --- 「購入履歴なし」の場合ここでリターン ---
  if (!hasPurchase) {
    return interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ 購入履歴なし")
          .setDescription("現在、あなたの購入履歴はありません。")
          .setColor(0xff0000)
      ],
      flags: 64
    });
  }

  // --- 残りの削除処理 ---
  if (deleteOps.length > 0) {
    await lotteryTickets.bulkWrite(deleteOps);
  }

  // --- 当選コインを加算 ---
  if (totalPrize > 0) {
    await updateCoins(userId, totalPrize);
  }

  const coins = await getCoins(userId);

// 4〜9等を集計表示
for (const rank of Object.keys(lowRankWins).sort((a, b) => a - b)) {
  const data = lowRankWins[rank];

  publicLines.push(
    `🏆 ${rank}等: ${data.count.toLocaleString()}枚 × ${data.prize.toLocaleString()}コイン`
  );
}

const embedList = [];

  // --- 結果メッセージ生成 ---
  if (publicLines.length > 0) {
    // 最大2Embedに分割（50行ずつ）
    const chunkSize = 50;
    const chunks = [];

    for (let i = 0; i < publicLines.length; i += chunkSize) {
      chunks.push(publicLines.slice(i, i + chunkSize).join("\n"));
    }

    chunks.slice(0, 2).forEach((desc, i) => {
      const embed = new EmbedBuilder()
        .setTitle(i === 0 ? "🎉 当選結果" : "🎉 当選結果")
        .setDescription(desc)
        .setColor(0xffd700);

      // 最後のEmbedにだけフッターを付ける
      if (i === chunks.length - 1 || i === 1) {
        embed.setFooter({
          text: `🎟 当選チケット: ${winCount} | 💰 合計当選金額: ${totalPrize.toLocaleString()}コイン | 所持金: ${coins.toLocaleString()}コイン`
        });
      }

      embedList.push(embed);
    });
  }

  const unpublishedCount = remainingPurchases.filter(
    p => !p.drawId || !publishedDrawIds.has(p.drawId)
  ).length;

  if (isUnpublished) {
    unpublishedCount++;
    continue;
  }
    embedList.push(
      new EmbedBuilder()
        .setTitle("⏳ 未公開の抽選")
        .setDescription(`未公開チケット: ${unpublishedCount.toLocaleString()}枚`)
        .setColor(0xaaaaaa)
    );


  if (publicLines.length === 0 && unpublishedCount === 0) {
    embedList.push(
      new EmbedBuilder()
        .setTitle("📭 当選結果なし")
        .setDescription(
          `当選したチケットはありませんでした。\n` +
          `合計当選金額: ${totalPrize.toLocaleString()}コイン\n所持金: ${coins.toLocaleString()}コイン`
        )
        .setColor(0x888888)
    );
  }

  await Promise.all(embedList.map(embed => interaction.followUp({ embeds: [embed] })));
}
