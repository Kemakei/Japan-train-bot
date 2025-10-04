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
    tickets.push({ number, letter: letter.toUpperCase(), drawId, claimed: false, createdAt: new Date() });
  }

  if (tickets.length === 0) {
    return interaction.reply({ content: '❌ 少なくとも1枚はチケットを指定してください', flags: 64 });
  }

  const costPerTicket = 500;
  const totalCost = tickets.length * costPerTicket;
  const coins = await client.getCoins(userId);

  if (coins < totalCost) {
    return interaction.reply({ content: `❌ 所持コインが足りません (${coins}コイン) 手数料合計: ${totalCost}コイン`, flags: 64 });
  }

  await client.updateCoins(userId, -totalCost);

  await client.lotteryCol.updateOne(
    { userId },
    { $push: { purchases: { $each: tickets } } },
    { upsert: true }
  );

  const embed = new EmbedBuilder()
    .setColor('Gold')
    .setTitle('🎟 宝くじ購入完了')
    .setDescription(tickets.map((t, i) => `ticket${i + 1}: ${t.number}${t.letter}`).join('\n'))
    .addFields({ name: '手数料', value: `${totalCost}コイン`, inline: true })
    .setFooter({ text: `残り所持金: ${coins - totalCost}コイン` });

  await interaction.reply({ embeds: [embed] });
}
