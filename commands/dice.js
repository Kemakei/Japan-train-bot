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

// サイコロ6個を振る関数
function rollDice() {
  return Array.from({ length: 6 }, () => Math.floor(Math.random() * 6) + 1);
}

// 出目から最大何個揃ったか計算
function getMaxCount(dice) {
  const counts = {};
  for (const d of dice) {
    counts[d] = (counts[d] || 0) + 1;
  }
  return Math.max(...Object.values(counts));
}

export async function execute(interaction, { client }) {
  const bet = interaction.options.getInteger('bet');
  if (bet <= 0) {
    await interaction.reply({ content: '掛け金は1以上で指定してください', ephemeral: true });
    return;
  }

  const userId = interaction.user.id;

  // 職業取得
  const jobDoc = await client.db.collection("jobs").findOne({ userId });
  const jobName = jobDoc?.job || '無職';

  // ===== サイコロを振る =====
  let dice = rollDice();
  let maxCount = getMaxCount(dice);

  // ===== 職業補正（ギャンブラー）=====
  // 一定確率で「振り直し」
  if (jobName === 'ギャンブラー') {
    const rerollChance = 0.35; // 35%で振り直し
    if (Math.random() < rerollChance) {
      const rerollDice = rollDice();
      const rerollMax = getMaxCount(rerollDice);

      // 振り直しのほうが良ければ採用
      if (rerollMax > maxCount) {
        dice = rerollDice;
        maxCount = rerollMax;
      }
    }
  }

  // ===== 勝敗判定 =====
  let multiplier = -1.8;
  let win = false;

  if (maxCount >= 3) {
    win = true;
    if (maxCount === 3) multiplier = 1.8;
    else if (maxCount === 4) multiplier = 2;
    else if (maxCount === 5) multiplier = 3;
    else if (maxCount === 6) multiplier = 5;
  }

  // ===== コイン処理 =====
  const coinsBefore = await client.getCoins(userId);
  const change = Math.round(bet * multiplier);
  let newCoins = coinsBefore + change;
  if (newCoins < 0) newCoins = 0;

  await client.setCoins(userId, newCoins);

  // ===== 表示 =====
  const diceText = dice.map(n => `**${n}**`).join(' ');

  const embed = new EmbedBuilder()
    .setTitle(win ? `${maxCount}つ揃いました！` : '3つ以上揃いませんでした')
    .setDescription(diceText)
    .setColor(win ? 0x00FF00 : 0xFF0000)
    .addFields(
      {
        name: change >= 0 ? '獲得コイン' : '失ったコイン',
        value: `${change >= 0 ? '+' : ''}${change}`,
        inline: true
      },
      {
        name: '所持コイン',
        value: `${newCoins}`,
        inline: true
      },
      {
        name: '職業',
        value: jobName,
        inline: true
      }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
