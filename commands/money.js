import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('money')
  .setDescription('あなたの所持金を確認します');

export async function execute(interaction) {
  const userId = interaction.user.id;
  const coins = interaction.client.getCoins(userId); // index.jsのcoinsを取得

  const embed = new EmbedBuilder()
    .setColor('Green') // 緑色
    .setDescription(`**あなたの所持金は ${coins}コイン です**`);

  await interaction.reply({ embeds: [embed] });
}
