import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getNextDrawId } from "../utils/draw.js";

// 当選判定（賞金と等級を返す）
function judgeTicket(ticketNumber, ticketLetter, drawNumber, drawLetter) {
  if (ticketNumber === drawNumber && ticketLetter === drawLetter) return { prize: 1000000000, rank: 1 };
  if (ticketNumber === drawNumber) return { prize: 500000000, rank: 2 };
  if (ticketNumber.slice(1) === drawNumber.slice(1) && ticketLetter === drawLetter) return { prize: 100000000, rank: 3 };
  if (ticketNumber.slice(1) === drawNumber.slice(1)) return { prize: 10000000, rank: 4 };
  if (ticketNumber.slice(2) === drawNumber.slice(2) && ticketLetter === drawLetter) return { prize: 5000000, rank: 5 };
  if (ticketNumber.slice(2) === drawNumber.slice(2)) return { prize: 3000000, rank: 6 };
  if (ticketNumber.slice(3) === drawNumber.slice(3) && ticketLetter === drawLetter) return { prize: 100000, rank: 7 };
  if (ticketNumber.slice(3) === drawNumber.slice(3)) return { prize: 100000, rank: 8 };
  if (ticketLetter === drawLetter) return { prize: 10000, rank: 9 };
  if (ticketNumber.slice(4) === drawNumber.slice(4)) return { prize: 5000, rank: 10 };
  return { prize: 0, rank: null };
}

export const data = new SlashCommandBuilder()
  .setName("takarakuji_random")
  .setDescription("宝くじをランダムで購入")
  .addIntegerOption(opt =>
    opt.setName("count")
       .setDescription("購入枚数（1〜10000）")
       .setRequired(true)
  );

export async function execute(interaction, { client }) {
  const userId = interaction.user.id;
  const count = Math.min(interaction.options.getInteger("count"), 10000);

  const drawNumber = client.takarakuji.number;
  const drawLetter = client.takarakuji.letter;
  const drawId = getNextDrawId(new Date());

  const tickets = [];
  for (let i = 0; i < count; i++) {
    const number = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
    const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));

    const { prize, rank } = judgeTicket(number, letter, drawNumber, drawLetter);
    tickets.push({
      number,
      letter,
      drawId,
      isWin: prize > 0,
      prize,
      rank,
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