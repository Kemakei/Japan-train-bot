import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getNextDrawId } from "../utils/draw.js";

// 当選判定（賞金と等級を返す）
function judgeTicket(ticketNumber, ticketLetter, drawNumber, drawLetter) {
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
  .setName("takarakuji_buy")
  .setDescription("宝くじを手動で購入")
  .addStringOption(opt =>
    opt.setName("tickets")
       .setDescription("購入するチケット番号を:で区切って入力（例 91736P:10486Q）")
       .setRequired(true)
  );

export async function execute(interaction, { client }) {
  const userId = interaction.user.id;
  const input = interaction.options.getString("tickets");

  let ticketInputs = input.split(":").map(s => s.trim()).filter(Boolean);

  if (ticketInputs.length === 0)
    return interaction.reply({ content: "❌ チケット番号を1枚以上入力してください", flags: 64 });

  if (ticketInputs.length > 10)
    return interaction.reply({ content: "❌ 最大10枚まで購入可能です", flags: 64 });

  const drawNumber = client.takarakuji.number;
  const drawLetter = client.takarakuji.letter;
  const drawId = getNextDrawId(new Date());

  const tickets = [];

  for (const ticket of ticketInputs) {
    if (!/^\d{5}[A-Z]$/i.test(ticket))
      return interaction.reply({ content: `❌ 無効なチケット番号: ${ticket}（形式: 5桁の数字+アルファベット）`, flags: 64 });

    const number = ticket.slice(0, 5);
    const letter = ticket.slice(5).toUpperCase();
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

  // 購入チケット番号をリスト化
  const ticketList = tickets.map((t, i) => `${i + 1}枚目: ${t.number}${t.letter}`).join("\n");

  // Embed作成
  const embed = new EmbedBuilder()
    .setTitle("🎟 宝くじ購入完了")
    .setDescription(`購入枚数: ${tickets.length}枚\n支払金額: ${totalCost}コイン\n\n**購入チケット:**\n${ticketList}`)
    .setColor("Gold")
    .setFooter({ text: `残り所持金: ${coins - totalCost}コイン` });

  await interaction.reply({ embeds: [embed] });
}
