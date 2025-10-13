import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getNextDrawId, getNextDrawNumbers } from "../utils/draw.js"; // ← 抽選番号を取得する関数（後述）

export const data = new SlashCommandBuilder()
  .setName("takarakuji_buy")
  .setDescription("宝くじを購入します")
  .addStringOption(opt =>
    opt
      .setName("tickets")
      .setDescription("購入するチケット番号を:で区切って入力（例: 12345A:54321B）")
      .setRequired(true)
  );

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

export async function execute(interaction, { client }) {
  const userId = interaction.user.id;
  const input = interaction.options.getString("tickets");

  const ticketInputs = input.split(":").map(s => s.trim()).filter(Boolean);
  if (ticketInputs.length === 0)
    return interaction.reply({ content: "❌ チケット番号を1枚以上入力してください", flags: 64 });
  if (ticketInputs.length > 500)
    return interaction.reply({ content: "❌ 一度に最大500枚まで購入可能です", flags: 64 });

  const drawId = getNextDrawId(new Date());
  const nextDraw = await getNextDrawNumbers(client.db); // { drawId, number, letter } を返す想定

  const costPerTicket = 1000;
  const totalCost = ticketInputs.length * costPerTicket;

  const coins = await client.getCoins(userId);
  if (coins < totalCost)
    return interaction.reply({ content: `❌ コイン不足 (${coins}/${totalCost})`, flags: 64 });

  await client.updateCoins(userId, -totalCost);

  const now = new Date();
  const tickets = [];
  let totalPrize = 0;

  for (const raw of ticketInputs) {
    if (!/^\d{5}[A-Z]$/i.test(raw))
      return interaction.reply({ content: `❌ 無効な形式: ${raw}`, flags: 64 });

    const number = raw.slice(0, 5);
    const letter = raw.slice(5).toUpperCase();
    const { prize, rank } = judgeTicket(number, letter, nextDraw.number, nextDraw.letter);

    if (prize > 0) totalPrize += prize;

    tickets.push({
      userId,
      number,
      letter,
      drawId,
      prize,
      rank,
      isWin: prize > 0,
      published: false, // ← 未公開
      checked: false,
      createdAt: now
    });
  }

  const lotteryCol = client.db.collection("lotteryTickets");
  await lotteryCol.insertMany(tickets);
  await lotteryCol.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

  const ticketList = tickets.map((t, i) => `${i + 1}枚目: ${t.number}${t.letter}`).join("\n");
  const embed = new EmbedBuilder()
    .setTitle("🎟 宝くじ購入完了")
    .setDescription(
      `購入枚数: ${tickets.length}枚\n支払金額: ${totalCost}コイン\n\n次回抽選 (${drawId}) は未公開です。\n\n**購入チケット:**\n${ticketList}`
    )
    .setColor("Gold")
    .setFooter({ text: `残り所持金: ${coins - totalCost}コイン` });

  await interaction.reply({ embeds: [embed] });
}
