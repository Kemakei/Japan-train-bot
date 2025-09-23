import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('takarakuji')
  .setDescription('最新公開済みの宝くじ当選番号を確認');

export async function execute(interaction, { client }) {
  const drawResultsCol = client.db.collection("drawResults");

  // 現在時刻で直近公開済み回を計算
  const now = new Date();
  const drawDate = new Date(now);
  drawDate.setSeconds(0, 0);

  if (drawDate.getMinutes() < 30) {
    drawDate.setMinutes(0);
  } else {
    drawDate.setMinutes(30);
  }
  const drawId = drawDate.toISOString();

  const result = await drawResultsCol.findOne({ drawId });

  if (!result) {
    return interaction.reply({ content: '❌ まだ抽選結果は公開されていません。', flags: 64 });
  }

  const { number, letter } = result;

  const allConditions = `
1等: 番号5桁 + 文字一致 100万コイン
2等: 番号5桁一致 75万コイン
3等: 下4桁 + 文字一致 50万コイン
4等: 下3桁一致 30万コイン
5等: 下2桁 + 文字一致 10万コイン
6等: 文字一致 5万コイン
7等: 下1桁一致 1万コイン
`;

  await interaction.reply(
    `🎯 最新公開済み当選番号 (回: ${drawId}): ${number}${letter}\n📋 当選条件:${allConditions}`
  );
}
