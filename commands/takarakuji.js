import { SlashCommandBuilder } from 'discord.js';
import { getLatestDrawId } from '../utils/draw.js'; // 変更

export const data = new SlashCommandBuilder()
  .setName('takarakuji')
  .setDescription('最新公開済みの宝くじ当選番号を確認');

export async function execute(interaction, { client }) {
  const drawResultsCol = client.db.collection("drawResults");

  const now = new Date();
  const drawId = getLatestDrawId(now); // ← 最新回に統一

  const result = await drawResultsCol.findOne({ drawId });

  if (!result) {
    return interaction.reply({ content: '❌ まだ抽選結果は公開されていません。', ephemeral: true });
  }

  const { number, letter } = result;

  const allConditions = `
   1等: 番号5桁 + 文字一致 10億コイン
   2等: 番号5桁一致 5億コイン
   3等: 1等の前後賞 1億コイン
   4等: 下4桁 + 文字一致 1000万コイン
   5等: 下4桁一致 100万コイン
   6等: 下3桁 + 文字一致 10万コイン
   7等: 下3桁一致 1万コイン
   8等: 下2桁 + 文字一致 5000コイン
   9等: 下2桁一致 2000コイン
   10等: 文字一致 500コイン
  `;

  await interaction.reply(
    `🎯 最新公開済み当選番号 (${number}${letter})\n📋 当選条件:${allConditions}`
  );
}
