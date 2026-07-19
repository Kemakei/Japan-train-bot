import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getNextDrawId } from "../utils/draw.js";

// 当選判定（賞金と等級を返す）
function judgeTicket(ticketNumber, ticketLetter, drawNumber, drawLetter) {
  // 1等: 番号5桁 + 文字一致 10億コイン
  if (ticketNumber === drawNumber && ticketLetter === drawLetter) {
    return { prize: 1000000000, rank: 1 };
  }

  // 2等: 番号5桁一致 1000万コイン
  if (ticketNumber === drawNumber) {
    return { prize: 10000000, rank: 2 };
  }

  // 3等: 下4桁 + 文字一致 200万コイン
  if (ticketNumber.slice(1) === drawNumber.slice(1) && ticketLetter === drawLetter) {
    return { prize: 2000000, rank: 3 };
  }

  // 4等: 下4桁一致 20万コイン
  if (ticketNumber.slice(1) === drawNumber.slice(1)) {
    return { prize: 200000, rank: 4 };
  }

  // 5等: 下3桁 + 文字一致 10万コイン
  if (ticketNumber.slice(2) === drawNumber.slice(2) && ticketLetter === drawLetter) {
    return { prize: 100000, rank: 5 };
  }

  // 6等: 下3桁一致 1万コイン
  if (ticketNumber.slice(2) === drawNumber.slice(2)) {
    return { prize: 10000, rank: 6 };
  }

  // 7等: 下2桁 + 文字一致 1000コイン
  if (ticketNumber.slice(3) === drawNumber.slice(3) && ticketLetter === drawLetter) {
    return { prize: 1000, rank: 7 };
  }

  // 8等: 下2桁一致 500コイン
  if (ticketNumber.slice(3) === drawNumber.slice(3)) {
    return { prize: 500, rank: 8 };
  }

  // 9等: 文字一致 200コイン
  if (ticketLetter === drawLetter) {
    return { prize: 200, rank: 9 };
  }

  return { prize: 0, rank: null };
}

export const data = new SlashCommandBuilder()
  .setName("takarakuji_random")
  .setDescription("宝くじをランダムで購入")
  .addIntegerOption(opt =>
    opt.setName("count")
       .setDescription("購入枚数（1〜10000）")
       .setRequired(true)
       .setMinValue(1)
       .setMaxValue(10000)
  );

export async function execute(interaction, { client }) {
  const userId = interaction.user.id;
  const count = Math.min(interaction.options.getInteger("count"), 10000);

  await interaction.deferReply();

  try {
    const drawNumber = client.takarakuji.number;
    const drawLetter = client.takarakuji.letter;
    const drawId = getNextDrawId(new Date());

    // --- チケット生成 ---
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
        claimed: false,
        createdAt: new Date()
      });
    }

    // --- コイン支払い ---
    const costPerTicket = 1000;
    const totalCost = tickets.length * costPerTicket;
    const coins = await client.getCoins(userId);

    if (coins < totalCost) {
      return interaction.editReply({ content: `❌ コイン不足 (${coins}/${totalCost})` });
    }

    await client.updateCoins(userId, -totalCost);

    // --- MongoDBへ保存（1000件ずつ） ---
    const batchSize = 1000;
    for (let i = 0; i < tickets.length; i += batchSize) {
      const batch = tickets.slice(i, i + batchSize);
      await client.lotteryTickets.insertMany(batch);
    }

    // --- Embed返信 ---
    const embed = new EmbedBuilder()
      .setTitle("🎟 宝くじ購入完了")
      .setDescription(`購入枚数: ${tickets.length}枚\n支払金額: ${totalCost}コイン`)
      .setColor("Gold")
      .setFooter({ text: `残り所持金: ${coins - totalCost}コイン` });

    await interaction.editReply({ embeds: [embed] });

  } catch (err) {
    await interaction.editReply({ content: "❌ 購入処理中にエラーが発生しました" });
  }
}
