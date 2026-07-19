import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getLatestDrawId } from "../utils/draw.js";

export const data = new SlashCommandBuilder()
  .setName("takarakuji_get")
  .setDescription("購入した宝くじの当選結果を確認します");

export async function execute(interaction) {
  const userId = interaction.user.id;

  const {
    lotteryTickets,
    lotterySummary,
    updateCoins,
    getCoins,
    db
  } = interaction.client;

  await interaction.deferReply();

  const latestDrawId = getLatestDrawId(new Date());

  const publishedDrawIds = new Set(
    (
      await db.collection("drawResults")
        .find(
          {
            drawId: {
              $lte: latestDrawId
            }
          },
          {
            projection: {
              drawId: 1
            }
          }
        )
        .toArray()
    ).map(x => x.drawId)
  );

  let hasPurchase = false;
  let totalPrize = 0;
  let winCount = 0;
  let unpublishedCount = 0;

  const publicLines = [];
  const deleteTicketIds = [];
  const deleteSummaryIds = [];

  const ticketCursor = lotteryTickets.find(
    {
      userId,
      claimed: false
    },
    {
      projection: {
        _id: 1,
        number: 1,
        letter: 1,
        rank: 1,
        prize: 1,
        drawId: 1
      }
    }
  ).batchSize(5000);

  for await (const ticket of ticketCursor) {
    hasPurchase = true;

    if (!publishedDrawIds.has(ticket.drawId)) {
      unpublishedCount++;
      continue;
    }

    totalPrize += ticket.prize;
    winCount++;

    if (publicLines.length < 100) {
      publicLines.push(
        `🎟 ${ticket.number}${ticket.letter} → 🏆 ${ticket.rank}等 💰 ${ticket.prize.toLocaleString()}コイン獲得！`
      );
    }

    deleteTicketIds.push(ticket._id);
  }

  const summaryCursor = lotterySummary.find(
    {
      userId
    },
    {
      projection: {
        _id: 1,
        drawId: 1,
        ranks: 1
      }
    }
  );

  for await (const summary of summaryCursor) {
    hasPurchase = true;

    if (!publishedDrawIds.has(summary.drawId)) {
      let count = 0;

      for (const rank of Object.keys(summary.ranks || {})) {
        count += summary.ranks[rank].count || 0;
      }

      unpublishedCount += count;
      continue;
    }

    for (const rank of Object.keys(summary.ranks || {})) {
      const data = summary.ranks[rank];

      if (rank === "miss") {
        continue;
      }

      const prize = data.prize || 0;
      const amount = data.count || 0;

      if (amount > 0) {
        totalPrize += amount * prize;
        winCount += amount;

        publicLines.push(
          `🏆 ${rank}等: ${amount.toLocaleString()}枚 × ${prize.toLocaleString()}コイン`
        );
      }
    }

    deleteSummaryIds.push(summary._id);
  }

  if (!hasPurchase) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ 購入履歴なし")
          .setDescription("現在、あなたの購入履歴はありません。")
          .setColor(0xff0000)
      ]
    });
  }

  if (deleteTicketIds.length) {
    await lotteryTickets.deleteMany({
      _id: {
        $in: deleteTicketIds
      }
    });
  }

  if (deleteSummaryIds.length) {
    await lotterySummary.deleteMany({
      _id: {
        $in: deleteSummaryIds
      }
    });
  }

  if (totalPrize > 0) {
    await updateCoins(userId, totalPrize);
  }

  const coins = await getCoins(userId);

  const embeds = [];

  if (publicLines.length) {
    for (let i = 0; i < publicLines.length; i += 50) {
      embeds.push(
        new EmbedBuilder()
          .setTitle("🎉 当選結果")
          .setDescription(
            publicLines.slice(i, i + 50).join("\n")
          )
          .setColor(0xffd700)
      );
    }

    embeds[embeds.length - 1].setFooter({
      text:
        `🎟 当選枚数: ${winCount.toLocaleString()}枚 | ` +
        `💰 合計当選金額: ${totalPrize.toLocaleString()}コイン | ` +
        `所持金: ${coins.toLocaleString()}コイン`
    });
  }

  if (unpublishedCount > 0) {
    embeds.push(
      new EmbedBuilder()
        .setTitle("⏳ 未公開の抽選")
        .setDescription(
          `未公開チケット: ${unpublishedCount.toLocaleString()}枚`
        )
        .setColor(0xaaaaaa)
    );
  }

  if (!publicLines.length && unpublishedCount === 0) {
    embeds.push(
      new EmbedBuilder()
        .setTitle("📭 当選結果なし")
        .setDescription(
          `当選したチケットはありませんでした。\n` +
          `合計当選金額: ${totalPrize.toLocaleString()}コイン\n` +
          `所持金: ${coins.toLocaleString()}コイン`
        )
        .setColor(0x888888)
    );
  }

  await Promise.all(
    embeds.map(embed =>
      interaction.followUp({
        embeds: [embed]
      })
    )
  );
}