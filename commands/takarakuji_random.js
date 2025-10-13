import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getNextDrawId } from "../utils/draw.js";

function judgeTicket(ticketNumber, ticketLetter, drawNumber, drawLetter) {
  const num = parseInt(ticketNumber, 10);
  const drawNum = parseInt(drawNumber, 10);

  if (ticketNumber === drawNumber && ticketLetter === drawLetter)
    return { prize: 1000000000, rank: 1 };
  if (ticketNumber === drawNumber)
    return { prize: 500000000, rank: 2 };
  if (ticketLetter === drawLetter && (num === drawNum - 1 || num === drawNum + 1))
    return { prize: 100000000, rank: 3 };
  if (ticketNumber.slice(1) === drawNumber.slice(1) && ticketLetter === drawLetter)
    return { prize: 10000000, rank: 4 };
  if (ticketNumber.slice(1) === drawNumber.slice(1))
    return { prize: 5000000, rank: 5 };
  if (ticketNumber.slice(2) === drawNumber.slice(2) && ticketLetter === drawLetter)
    return { prize: 3000000, rank: 6 };
  if (ticketNumber.slice(2) === drawNumber.slice(2))
    return { prize: 1000000, rank: 7 };
  if (ticketNumber.slice(3) === drawNumber.slice(3) && ticketLetter === drawLetter)
    return { prize: 500000, rank: 8 };
  if (ticketNumber.slice(3) === drawNumber.slice(3))
    return { prize: 100000, rank: 9 };
  if (ticketLetter === drawLetter)
    return { prize: 10000, rank: 10 };
  if (ticketNumber.slice(4) === drawNumber.slice(4))
    return { prize: 5000, rank: 11 };

  return { prize: 0, rank: null };
}

export const data = new SlashCommandBuilder()
  .setName("takarakuji_random")
  .setDescription("宝くじをランダムで購入")
  .addIntegerOption(opt =>
    opt
      .setName("count")
      .setDescription("購入枚数（1〜500）")
      .setRequired(true)
  );

export async function execute(interaction, { client }) {
  try {
    const userId = interaction.user.id;
    const count = Math.min(interaction.options.getInteger("count"), 500);
    const costPerTicket = 1000;
    const totalCost = count * costPerTicket;

    const drawData = client.takarakuji;
    if (!drawData || !drawData.number || !drawData.letter) {
      return interaction.reply({
        content: "⚠️ 現在の宝くじ情報を取得できません。しばらくしてから再試行してください。",
        flags: 64
      });
    }

    const { number: drawNumber, letter: drawLetter } = drawData;
    const drawId = getNextDrawId(new Date());
    const coins = await client.getCoins(userId);

    if (coins < totalCost) {
      return interaction.reply({
        content: `❌ コイン不足です (${coins}/${totalCost})`,
        flags: 64
      });
    }

    const tickets = [];
    for (let i = 0; i < count; i++) {
      const number = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
      const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      const { prize, rank } = judgeTicket(number, letter, drawNumber, drawLetter);

      tickets.push({
        userId,
        number,
        letter,
        drawId,
        isWin: prize > 0,
        prize,
        rank,
        published: false, // ← 公開前
        createdAt: new Date()
      });
    }

    await client.updateCoins(userId, -totalCost);

    const lotteryCol = client.db.collection("lotteryTickets");
    await lotteryCol.insertMany(tickets);
    await lotteryCol.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

    const embed = new EmbedBuilder()
      .setTitle("🎟 宝くじ購入完了（未公開）")
      .setDescription(`購入枚数: ${count}枚\n支払金額: ${totalCost.toLocaleString()}コイン\n\n🕒 次回抽選発表までお待ちください。`)
      .setColor("Blue")
      .setFooter({ text: `残り所持金: ${(coins - totalCost).toLocaleString()}コイン` });

    await interaction.reply({ embeds: [embed], ephemeral: true }); // ← 非公開表示
  } catch (err) {
    console.error("takarakuji_random 実行中エラー:", err);
    return interaction.reply({
      content: "⚠️ 予期せぬエラーが発生しました。",
      flags: 64
    });
  }
}
