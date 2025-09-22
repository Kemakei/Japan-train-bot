import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('takarakuji')
  .setDescription('現在の宝くじ当選番号を確認');

export async function execute(interaction, { client }) {
  const tj = client.takarakuji;
  const allConditions = `
1等: 番号5桁 + 文字一致
2等: 番号5桁一致
3等: 下4桁 + 文字一致
4等: 下3桁一致
5等: 下2桁 + 文字一致
6等: 文字一致
7等: 下1桁一致
`;

  await interaction.reply(`🎯 現在の当選番号: ${tj.number}${tj.letter}\n📋 当選条件:${allConditions}`);
}
