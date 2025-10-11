import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getNextDrawId } from "../utils/draw.js";

// 独立版 judgeTicket（takarakuji_buyとは干渉しない）
function judgeTicket(ticketNumber, ticketLetter, drawNumber, drawLetter) {
  let prizeAmount = 0;
  if (ticketNumber === drawNumber && ticketLetter === drawLetter) prizeAmount = 1000000000;
  else if (ticketNumber === drawNumber) prizeAmount = 500000000;
  else if (ticketNumber.slice(1) === drawNumber.slice(1) && ticketLetter === drawLetter) prizeAmount = 10000000;
  else if (ticketNumber.slice(1) === drawNumber.slice(1)) prizeAmount = 5000000;
  else if (ticketNumber.slice(2) === drawNumber.slice(2) && ticketLetter === drawLetter) prizeAmount = 3000000;
  else if (ticketNumber.slice(2) === drawNumber.slice(2)) prizeAmount = 1000000;
  else if (ticketNumber.slice(3) === drawNumber.slice(3) && ticketLetter === drawLetter) prizeAmount = 500000;
  else if (ticketNumber.slice(3) === drawNumber.slice(3)) prizeAmount = 100000;
  else if (ticketLetter === drawLetter) prizeAmount = 10000;
  else if (ticketNumber.slice(4) === drawNumber.slice(4)) prizeAmount = 5000;
  return prizeAmount;
}

export const data = new SlashCommandBuilder()
  .setName("takarakuji_random")
  .setDescription("宝くじをランダムで購入")
  .addIntegerOption(opt =>
    opt.setName("count")
       .setDescription("購入枚数（1〜500）")
       .setRequired(true)
  );

export async function execute(interaction, { client }) {
  const userId = interaction.user.id;
  const count = Math.min(interaction.options.getInteger("count"), 500);

  const drawNumber = client.takarakuji.number;
  const drawLetter = client.takarakuji.letter;
  const drawId = getNextDrawId(new Date());

  const tickets = [];
  for (let i = 0; i < count; i++) {
    const number = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
    const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));

    const prize = judgeTicket(number, letter, drawNumber, drawLetter);
    tickets.push({
      number,
      letter,
      drawId,
      isWin: prize > 0,
      prize,
      claimed: false,
      createdAt: new Date()
    });
  }

  const costPerTicket = 1000;
  const totalCost = tickets.length * costPerTicket;
  const coins = await client.getCoins(userId);
  if (coins < totalCost)
    return interaction.reply({ content: `❌ コイン不足 (${coins}/${totalCost})`, flags: 64 });

  await client.updateCoins(userId, -totalCost);
  await client.lotteryCol.updateOne(
    { userId },
    { $push: { purchases: { $each: tickets } } },
    { upsert: true }
  );

  // Embedには購入枚数と支払金額だけ表示
  const embed = new EmbedBuilder()
    .setTitle("🎟 宝くじ購入完了")
    .setDescription(`購入枚数: ${tickets.length}枚\n支払金額: ${totalCost}コイン`)
    .setColor("Gold")
    .setFooter({ text: `残り所持金: ${coins - totalCost}コイン` });

  await interaction.reply({ embeds: [embed] });
}
