import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('dice')
  .setDescription('サイコロを6つ振ってギャンブルします')
  .addIntegerOption(option =>
    option.setName('bet')
      .setDescription('掛け金')
      .setRequired(true)
  );

/**
 * 職業補正付きで揃う数（maxCount）を決める
 * @param {string} jobName - ユーザーの職業
 * @returns {number} maxCount（3以上で勝ち、2以下で負け）
 */
function pickResult(jobName = '無職') {
  // 基本確率
  const probabilities = {
    3: 0.23,
    4: 0.10,
    5: 0.02,
    6: 0.002
  };

  // 職業補正: ギャンブラーなら当たりやすくする
  if (jobName === 'ギャンブラー') {
    probabilities[3] += 0.05;
    probabilities[4] += 0.03;
    probabilities[5] += 0.01;
    probabilities[6] += 0.001;
  }

  // ランダムでどれが出るか決定
  const r = Math.random();
  let cumulative = 0;
  for (let count = 6; count >= 3; count--) {
    cumulative += probabilities[count] || 0;
    if (r < cumulative) return count;
  }

  // 3つ以上揃わなければ負け
  return 2;
}

export async function execute(interaction, { client }) {
  const bet = interaction.options.getInteger('bet');

  if (bet <= 0) {
    await interaction.reply({ content: '掛け金は1以上で指定してください', ephemeral: true });
    return;
  }

  const userId = interaction.user.id;

  // ユーザー職業取得
  const jobDoc = await client.db.collection("jobs").findOne({ userId });
  const jobName = jobDoc?.job || '無職';

  // サイコロ6つをランダムで振る
  const dice = Array.from({ length: 6 }, () => Math.floor(Math.random() * 6) + 1);

  // 最大何個揃ったかを職業補正付きで決定
  const maxCount = pickResult(jobName);

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
  let coinsBefore = await client.getCoins(userId);
  let change = Math.round(bet * multiplier);
  let newCoins = coinsBefore + change;

  // 所持コインがマイナスになったら0にする
  if (newCoins < 0) newCoins = 0;

  await client.setCoins(userId, newCoins);

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
      { name: '所持コイン', value: `${newCoins}`, inline: true },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
