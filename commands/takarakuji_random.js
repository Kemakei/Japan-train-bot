import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getNextDrawId } from "../utils/draw.js";

function judgeTicket(ticketNumber, ticketLetter, drawNumber, drawLetter) {
  if (ticketNumber === drawNumber && ticketLetter === drawLetter)
    return { prize: 1000000000, rank: 1 };

  if (ticketNumber === drawNumber)
    return { prize: 10000000, rank: 2 };

  if (ticketNumber.slice(1) === drawNumber.slice(1) && ticketLetter === drawLetter)
    return { prize: 2000000, rank: 3 };

  if (ticketNumber.slice(1) === drawNumber.slice(1))
    return { prize: 200000, rank: 4 };

  if (ticketNumber.slice(2) === drawNumber.slice(2) && ticketLetter === drawLetter)
    return { prize: 100000, rank: 5 };

  if (ticketNumber.slice(2) === drawNumber.slice(2))
    return { prize: 10000, rank: 6 };

  if (ticketNumber.slice(3) === drawNumber.slice(3) && ticketLetter === drawLetter)
    return { prize: 1000, rank: 7 };

  if (ticketNumber.slice(3) === drawNumber.slice(3))
    return { prize: 500, rank: 8 };

  if (ticketLetter === drawLetter)
    return { prize: 200, rank: 9 };

  return { prize: 0, rank: null };
}

export const data = new SlashCommandBuilder()
  .setName("takarakuji_random")
  .setDescription("宝くじをランダムで購入")
  .addIntegerOption(opt =>
    opt
      .setName("count")
      .setDescription("購入枚数（1〜10000）")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(10000)
  );

export async function execute(interaction, { client }) {
  const userId = interaction.user.id;
  const count = interaction.options.getInteger("count");

  await interaction.deferReply();

  try {
    const drawNumber = client.takarakuji.number;
    const drawLetter = client.takarakuji.letter;

    const drawId = getNextDrawId(new Date());
    const now = new Date();

    const highRankTickets = [];

    const summary = {
      miss: 0
    };

    for (let i = 0; i < count; i++) {
      const number = String(
        Math.floor(Math.random() * 100000)
      ).padStart(5, "0");

      const letter = String.fromCharCode(
        65 + Math.floor(Math.random() * 26)
      );

      const result = judgeTicket(
        number,
        letter,
        drawNumber,
        drawLetter
      );

      if (!result.rank) {
        summary.miss++;
        continue;
      }

      if (result.rank <= 3) {
        highRankTickets.push({
          userId,
          drawId,
          number,
          letter,
          rank: result.rank,
          prize: result.prize,
          isWin: true,
          claimed: false,
          createdAt: now
        });
      } else {
        if (!summary[result.rank]) {
          summary[result.rank] = {
            count: 0,
            prize: result.prize
          };
        }

        summary[result.rank].count++;
      }
    }

    const totalCost = count * 1000;
    const coins = await client.getCoins(userId);

    if (coins < totalCost) {
      return interaction.editReply({
        content: `❌ コイン不足 (${coins}/${totalCost})`
      });
    }

    await client.updateCoins(userId, -totalCost);

    if (highRankTickets.length) {
      const batchSize = 10000;

      for (
        let i = 0;
        i < highRankTickets.length;
        i += batchSize
      ) {
        await client.lotteryTickets.insertMany(
          highRankTickets.slice(i, i + batchSize),
          {
            ordered: false
          }
        );
      }
    }

    const inc = {};
    const set = {
      userId,
      drawId,
      createdAt: now
    };

    for (const key of Object.keys(summary)) {
      if (key === "miss") {
        inc["ranks.miss.count"] = summary.miss;
        continue;
      }

      inc[`ranks.${key}.count`] = summary[key].count;
      set[`ranks.${key}.prize`] = summary[key].prize;
    }

    if (Object.keys(inc).length) {
      await client.lotterySummary.updateOne(
        {
          userId,
          drawId
        },
        {
          $set: set,
          $inc: inc
        },
        {
          upsert: true
        }
      );
    }

    const embed = new EmbedBuilder()
      .setTitle("🎟 宝くじ購入完了")
      .setDescription(
        `購入枚数: ${count.toLocaleString()}枚\n` +
        `支払金額: ${totalCost.toLocaleString()}コイン`
      )
      .setColor("Gold")
      .setFooter({
        text: `残り所持金: ${(coins - totalCost).toLocaleString()}コイン`
      });

    await interaction.editReply({
      embeds: [embed]
    });
  } catch (err) {
    console.error(err);

    await interaction.editReply({
      content: "❌ 購入処理中にエラーが発生しました"
    });
  }
}