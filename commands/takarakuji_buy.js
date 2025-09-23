import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getNextDrawId } from '../utils/draw.js';

export const data = new SlashCommandBuilder()
  .setName('takarakuji_buy')
  .setDescription('宝くじを購入する')
  .addStringOption(opt => opt.setName('number1').setDescription('1個目の5桁の数字').setRequired(true))
  .addStringOption(opt => opt.setName('letter1').setDescription('1個目のA-Z文字').setRequired(true))
  .addStringOption(opt => opt.setName('number2').setDescription('2個目の5桁の数字'))
  .addStringOption(opt => opt.setName('letter2').setDescription('2個目のA-Z文字'))
  .addStringOption(opt => opt.setName('number3').setDescription('3個目の5桁の数字'))
  .addStringOption(opt => opt.setName('letter3').setDescription('3個目のA-Z文字'))
  .addStringOption(opt => opt.setName('number4').setDescription('4個目の5桁の数字'))
  .addStringOption(opt => opt.setName('letter4').setDescription('4個目のA-Z文字'))
  .addStringOption(opt => opt.setName('number5').setDescription('5個目の5桁の数字'))
  .addStringOption(opt => opt.setName('letter5').setDescription('5個目のA-Z文字'));

export async function execute(interaction, { client }) {
  const userId = interaction.user.id;
  const tickets = [];

  for (let i = 1; i <= 5; i++) {
    const num = interaction.options.getString(`number${i}`);
    const letter = interaction.options.getString(`letter${i}`)?.toUpperCase();
    if (!num && !letter) continue;
    if (!num || !letter) {
      return interaction.reply({ content: `❌ ${i}個目の数字と文字は両方入力してください`, flags: 64 });
    }
    if (!/^\d{5}$/.test(num)) {
      return interaction.reply({ content: `❌ ${i}個目の数字は5桁で入力してください`, flags: 64 });
    }
    if (!/^[A-Z]$/.test(letter)) {
      return interaction.reply({ content: `❌ ${i}個目の文字はA-Zの1文字で入力してください`, flags: 64 });
    }

    const drawId = getNextDrawId(); // 次の回を割り当て
    tickets.push({ number: num, letter, drawId, claimed: false, createdAt: new Date() });
  }

  if (tickets.length === 0) {
    return interaction.reply({ content: '❌ 少なくとも1つは宝くじを指定してください', flags: 64 });
  }

  const costPerTicket = 200;
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
    .setDescription(
      tickets.map((t, i) => `${i + 1}個目: ${t.number}${t.letter}`).join('\n')
    )
    .addFields({ name: '手数料', value: `${totalCost}コイン`, inline: true })
    .setFooter({ text: `残り所持金: ${coins - totalCost}コイン` });

  await interaction.reply({ embeds: [embed] }); // ✅ ephemeralにせず公開
}
