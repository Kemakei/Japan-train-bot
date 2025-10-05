// -------------------- takarakuji_buy.js --------------------
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getNextDrawId } from '../utils/draw.js';

export const data = new SlashCommandBuilder()
  .setName('takarakuji_buy')
  .setDescription('宝くじを購入する');

for (let i = 1; i <= 10; i++) {
  data.addStringOption(opt =>
    opt.setName(`ticket${i}`)
       .setDescription(`${i}枚目のチケット`)
  );
}

export async function execute(interaction, { client }) {
  const userId = interaction.user.id;
  const tickets = [];
  const drawId = getNextDrawId(new Date());

  for (let i = 1; i <= 10; i++) {
    const ticketStr = interaction.options.getString(`ticket${i}`);
    if (!ticketStr) continue;

    const match = ticketStr.match(/^(\d{5})([A-Z])$/i);
    if (!match) {
      return interaction.reply({ content: `❌ ticket${i} の形式が正しくありません`, flags: 64 });
    }

    const [_, number, letter] = match;
    tickets.push({
      number,
      letter: letter.toUpperCase(),
      drawId,
      claimed: false,
      createdAt: new Date()
    });
  }

  if (tickets.length === 0) {
    return interaction.reply({ content: '❌ 少なくとも1枚はチケットを指定してください', flags: 64 });
  }

  const costPerTicket = 1000; // 1枚あたり1000コイン
  const totalCost = tickets.length * costPerTicket;
  const coins = await client.getCoins(userId);

  if (coins < totalCost) {
    return interaction.reply({ content: `❌ 所持コインが足りません (${coins}コイン) 手数料合計: ${totalCost}コイン`, flags: 64 });
  }

  // コインを引く
  await client.updateCoins(userId, -totalCost);

  // DBに保存
  await client.lotteryCol.updateOne(
    { userId },
    { $push: { purchases: { $each: tickets } } },
    { upsert: true }
  );

  // Embed表示: 「1個目」「2個目」…の形式
  const embedDescription = tickets
    .map((t, i) => `${i + 1}個目: ${t.number}${t.letter}`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor('Gold')
    .setTitle('🎟 宝くじ購入完了')
    .setDescription(embedDescription)
    .addFields({ name: '手数料', value: `${totalCost}コイン`, inline: true })
    .setFooter({ text: `残り所持金: ${coins - totalCost}コイン` });

  await interaction.reply({ embeds: [embed] });
}
