import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('takarakuji_buy')
  .setDescription('宝くじを購入する')
  .addStringOption(option =>
    option.setName('number')
      .setDescription('5桁の数字')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('letter')
      .setDescription('A-Zの文字')
      .setRequired(true)
  );

export async function execute(interaction, { client }) {
  const num = interaction.options.getString('number');
  const letter = interaction.options.getString('letter').toUpperCase();

  if (!/^\d{5}$/.test(num)) {
    return interaction.reply({ content: '❌ 数字は5桁で入力してください', flags: 64 });
  }
  if (!/^[A-Z]$/.test(letter)) {
    return interaction.reply({ content: '❌ 文字はA-Zの1文字で入力してください', flags: 64 });
  }

  const userId = interaction.user.id;

  const purchase = {
    number: num,
    letter,
    drawNumber: null,
    drawLetter: null,
    claimed: false,
    createdAt: new Date()
  };

  try {
    await client.lotteryCol.updateOne(
      { userId },
      { $push: { purchases: purchase } },
      { upsert: true }
    );

    await interaction.reply({ content: `🎟 宝くじを購入しました: ${num}${letter}`, flags: 64 });
  } catch (err) {
    console.error('takarakuji_buy MongoDB エラー:', err);
    await interaction.reply({ content: '❌ 購入中にエラーが発生しました', flags: 64 });
  }
}
