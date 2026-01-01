import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('dice')
  .setDescription('サイコロを6つ振ってギャンブルします')
  .addIntegerOption(option =>
    option.setName('bet')
      .setDescription('掛け金')
      .setRequired(true)
      .setMinValue(100)
  );

export async function execute(interaction, { client }) {
  const bet = interaction.options.getInteger('bet');

  // サイコロ6つをランダムで振る
  const dice = Array.from({ length: 6 }, () => Math.floor(Math.random() * 6) + 1);

  // 数字ごとの出現数をカウント
  const counts = {};
  for (const d of dice) {
    counts[d] = (counts[d] || 0) + 1;
  }

  // 最大何個揃ったか確認
  const maxCount = Math.max(...Object.values(counts));

  // デフォルトは負け
  let multiplier = -1.8;
  let win = false;

  if (maxCount >= 3) {
    win = true;
    if (maxCount === 3) multiplier = 1.8;
    else if (maxCount === 4) multiplier = 2;
    else if (maxCount === 5) multiplier = 3;
    else if (maxCount === 6) multiplier = 5;
  }

  // コイン反映
  let coinsBefore = await client.getCoins(interaction.user.id);
  let change = Math.round(bet * multiplier);
  let newCoins = coinsBefore + change;

  // 所持コインがマイナスになったら0にする
  if (newCoins < 0) newCoins = 0;

  await client.setCoins(interaction.user.id, newCoins);

  // サイコロの結果を太文字に
  const diceText = dice.map(n => `**${n}**`).join(' ');

  // Embed作成
  const embed = new EmbedBuilder()
    .setTitle(win ? `${maxCount}つ揃いました！` : '3つ以上揃いませんでした')
    .setDescription(diceText)
    .setColor(win ? 0x00FF00 : 0xFF0000) // 緑:勝ち / 赤:負け
    .addFields(
      { 
        name: change >= 0 ? '獲得コイン' : '失ったコイン', 
        value: `${change >= 0 ? '+' : ''}${change}`, 
        inline: true 
      },
      { name: '所持コイン', value: `${newCoins}`, inline: true }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
