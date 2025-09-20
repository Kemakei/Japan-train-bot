import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('guess')
  .setDescription('1,2,3の中から数字を選んで勝負！')
  .addIntegerOption(option =>
    option.setName('number')
      .setDescription('1, 2, 3の中から選択')
      .setRequired(true)
      .addChoices(
        { name: '1', value: 1 },
        { name: '2', value: 2 },
        { name: '3', value: 3 }
      )
  )
  .addIntegerOption(option =>
    option.setName('bet')
      .setDescription('賭け金')
      .setRequired(true)
  );

export async function execute(interaction, client) {
  const userId = interaction.user.id;
  const guess = interaction.options.getInteger('number');
  const bet = interaction.options.getInteger('bet');

  let coins = interaction.client.getCoins(userId) || 0;

  if (bet <= 0) {
    await interaction.reply({ content: "❌ 正しい賭け金を入力してください！", ephemeral: true });
    return;
  }

  // 「賭け金 × 1.5 <= 所持コイン」チェック
  if (bet * 1.5 > coins) {
    const maxBet = Math.floor(coins / 1.5);
    await interaction.reply({ content: `❌ 所持コインが足りません！最大賭け金は ${maxBet} コインです。`, ephemeral: true });
    return;
  }

  const answer = Math.floor(Math.random() * 3) + 1;

  let embed = new EmbedBuilder()
    .setTitle("🎲 数字予想ゲーム")
    .addFields(
      { name: "選んだ数字", value: `${guess}`, inline: true },
      { name: "正解", value: `${answer}`, inline: true }
    );

  if (guess === answer) {
    // 勝利
    const win = Math.ceil(bet * 2.8);
    client.updateCoins(userId, win);
    coins = interaction.client.getCoins(userId);
    embed
      .setDescription(`当たり！ ${win}\n現在のコイン: ${coins}`)
      .setColor("#00FF00"); // 緑
  } else {
    // 敗北
    const loss = Math.ceil(bet * 1.5);
    client.updateCoins(userId, -loss);
    coins = interaction.client.getCoins(userId);
    embed
      .setDescription(`外れ... ${loss}\n現在のコイン: ${coins}`)
      .setColor("#FF0000"); // 赤
  }

  await interaction.reply({ embeds: [embed] });
}
