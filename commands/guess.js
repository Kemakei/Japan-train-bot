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

export async function execute(interaction) {
  const userId = interaction.user.id;
  const guess = interaction.options.getInteger('number');
  const bet = interaction.options.getInteger('bet');
  const client = interaction.client;

  let coins = client.getCoins(userId) || 0;

  if (bet <= 100) return interaction.reply({ content: "❌ 最低額は100コインです。", flags: 64 });
  if (bet * 1.5 > coins) {
    const maxBet = Math.floor(coins / 1.5);
    return interaction.reply({ content: `❌ 所持コインが足りません。最大賭け金は ${maxBet} コインです。`, flags: 64 });
  }

  await interaction.deferReply();

  const answer = Math.floor(Math.random() * 3) + 1;

  const embed = new EmbedBuilder()
    .addFields(
      { name: "選んだ数字", value: `${guess}`, inline: true },
      { name: "正解", value: `${answer}`, inline: true }
    );

  if (guess === answer) {
    const win = Math.ceil(bet * 2.8);
    client.updateCoins(userId, win);
    coins = client.getCoins(userId);
    embed.setDescription(`当たり！ ${win}\n現在のコイン: ${coins}`).setColor("#00FF00");
  } else {
    const loss = Math.ceil(bet * 1.5);
    client.updateCoins(userId, -loss);
    coins = client.getCoins(userId);
    embed.setDescription(`外れ... ${loss}\n現在のコイン: ${coins}`).setColor("#FF0000");
  }

  await interaction.editReply({ embeds: [embed] });
}
