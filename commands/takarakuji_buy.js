import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getNextDrawId } from "../utils/draw.js";

export const data = new SlashCommandBuilder()
  .setName("takarakuji")
  .setDescription("宝くじを購入（手動 or ランダム）")
  .addIntegerOption(opt =>
    opt.setName("count")
       .setDescription("購入枚数（1〜500）")
       .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName("mode")
       .setDescription("購入モード: manual or random")
       .setRequired(true)
       .addChoices(
         { name: "manual", value: "manual" },
         { name: "random", value: "random" }
       )
  );

// 購入時に判定する関数（DBに保存用でOK）
function judgeTicket(ticketNumber, ticketLetter, drawNumber, drawLetter) {
  let prizeAmount = 0;
  const numInt = parseInt(ticketNumber, 10);
  const drawInt = parseInt(drawNumber, 10);

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

export async function execute(interaction, { client }) {
  const userId = interaction.user.id;
  const count = Math.min(interaction.options.getInteger("count"), 500);
  const mode = interaction.options.getString("mode");

  const drawNumber = client.takarakuji.number;
  const drawLetter = client.takarakuji.letter;
  const drawId = getNextDrawId(new Date());

  const tickets = [];
  for (let i = 0; i < count; i++) {
    let number, letter;
    if (mode === "manual") {
      number = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
      letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    } else {
      number = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
      letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    }

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

  if (coins < totalCost) {
    return interaction.reply({ content: `❌ コイン不足 (${coins}/${totalCost})`, flags: 64 });
  }

  await client.updateCoins(userId, -totalCost);

  // DBに保存
  await client.lotteryCol.updateOne(
    { userId },
    { $push: { purchases: { $each: tickets } } },
    { upsert: true }
  );

  // Embed作成（当たり判定は表示せず）
  const embed = new EmbedBuilder()
    .setTitle("🎟 宝くじ購入完了")
    .setDescription(`購入枚数: ${tickets.length}枚\n支払金額: ${totalCost}コイン`)
    .setColor("Gold")
    .setFooter({ text: `残り所持金: ${coins - totalCost}コイン` });

  await interaction.reply({ embeds: [embed] });
}
