import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('takarakuji_buy')
  .setDescription('宝くじを購入する')
  .addStringOption(option =>
    option.setName('number1')
      .setDescription('1個目の5桁の数字')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('letter1')
      .setDescription('1個目のA-Z文字')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('number2')
      .setDescription('2個目の5桁の数字'))
  .addStringOption(option =>
    option.setName('letter2')
      .setDescription('2個目のA-Z文字'))
  .addStringOption(option =>
    option.setName('number3')
      .setDescription('3個目の5桁の数字'))
  .addStringOption(option =>
    option.setName('letter3')
      .setDescription('3個目のA-Z文字'))
  .addStringOption(option =>
    option.setName('number4')
      .setDescription('4個目の5桁の数字'))
  .addStringOption(option =>
    option.setName('letter4')
      .setDescription('4個目のA-Z文字'))
  .addStringOption(option =>
    option.setName('number5')
      .setDescription('5個目の5桁の数字'))
  .addStringOption(option =>
    option.setName('letter5')
      .setDescription('5個目のA-Z文字'));

export async function execute(interaction, { client }) {
  const userId = interaction.user.id;

  // 宝くじオプションを配列でまとめる
  const tickets = [];
  for (let i = 1; i <= 5; i++) {
    const num = interaction.options.getString(`number${i}`);
    const letter = interaction.options.getString(`letter${i}`)?.toUpperCase();
    if (!num && !letter) continue;
    if (!num || !letter) {
      return interaction.reply({ content: `❌ ${i}個目の数字と文字は両方入力してください`, ephemeral: true });
    }
    // 入力チェック
    if (!/^\d{5}$/.test(num)) {
      return interaction.reply({ content: `❌ ${i}個目の数字は5桁で入力してください`, ephemeral: true });
    }
    if (!/^[A-Z]$/.test(letter)) {
      return interaction.reply({ content: `❌ ${i}個目の文字はA-Zの1文字で入力してください`, ephemeral: true });
    }
    tickets.push({ number: num, letter });
  }

  if (tickets.length === 0) {
    return interaction.reply({ content: '❌ 少なくとも1つは宝くじを指定してください', ephemeral: true });
  }

  const costPerTicket = 200;
  const totalCost = tickets.length * costPerTicket;

  // コイン確認
  const coins = await client.getCoins(userId);
  if (coins < totalCost) {
    return interaction.reply({ content: `❌ 所持コインが足りません (${coins}コイン) 手数料合計: ${totalCost}コイン`, ephemeral: true });
  }

  // コイン減算
  await client.updateCoins(userId, -totalCost);

  // 購入処理
  const purchases = tickets.map(t => ({
    ...t,
    drawNumber: null,
    drawLetter: null,
    claimed: false,
    createdAt: new Date()
  }));

  await client.lotteryCol.updateOne(
    { userId },
    { $push: { purchases: { $each: purchases } } },
    { upsert: true }
  );

  // メッセージ作成
  const embed = new EmbedBuilder()
    .setColor('Gold')
    .setTitle('🎟 宝くじ購入完了')
    .setDescription(
      tickets.map((t, i) => `${i + 1}個目: ${t.number}${t.letter}`).join('\n')
    )
    .addFields({ name: '手数料', value: `${totalCost}コイン`, inline: true })
    .setFooter({ text: `残り所持金: ${coins - totalCost}コイン` });

  await interaction.reply({ embeds: [embed] });
}
