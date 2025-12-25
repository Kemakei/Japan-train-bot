import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const jobsInfo = {
  "無職": { base: 0, cooldown: 0 },
  "ギャンブラー": { base: 100, cooldown: 5 * 60 * 1000 },
  "アルバイト": { base: 800, cooldown: 10 * 60 * 1000 },
  "教師": { base: 2000, cooldown: 20 * 60 * 1000 },
  "銀行員": { base: 5000, cooldown: 15 * 60 * 1000 },
  "ジャーナリスト": { base: 7000, cooldown: 20 * 60 * 1000 },
  "プログラマー": { base: 10000, cooldown: 30 * 60 * 1000 },
  "パイロット": { base: 15000, cooldown: 30 * 60 * 1000 },
  "エンジニア": { base: 20000, cooldown: 60 * 60 * 1000 },
  "医師": { base: 50000, cooldown: 60 * 60 * 1000 },
};

function applyVariance(base) {
  const variance = Math.random() * 0.08 - 0.03; // -3% ~ +5%
  return Math.floor(base * (1 + variance));
}

export const data = new SlashCommandBuilder()
  .setName('work')
  .setDescription('職業に応じてお金を稼ぎます');

export async function execute(interaction) {
  const userId = interaction.user.id;
  const now = Date.now();

  let userJob = await interaction.client.getJobData(userId);
  if (!userJob) userJob = { job: '無職', talent: 1, skill: 0, workCount: 0 };

  if (userJob.job === '無職') {
    return interaction.reply({ content: '❌/jobで職についてください', flags: 64 });
  }

  if (!interaction.client.workCooldowns) interaction.client.workCooldowns = {};
  const lastWork = interaction.client.workCooldowns[userId] || 0;
  const cooldown = jobsInfo[userJob.job].cooldown;

  if (cooldown > 0 && now - lastWork < cooldown) {
    const rem = cooldown - (now - lastWork);
    const m = Math.floor(rem / 60000);
    const s = Math.floor((rem % 60000) / 1000);
    return interaction.reply({ content: `⏳ 次に働けるまで **${m}分${s}秒**です。`, flags: 64 });
  }

  await interaction.deferReply();

  // 熟練度計算
  let workCount = (userJob.workCount || 0) + 1;
  let skill = userJob.skill || 0;
  if (workCount >= 3) {
    skill += 1;
    workCount = 0;
  }

  const base = applyVariance(jobsInfo[userJob.job].base);
  const earned = Math.floor((base + (skill / 10 * base)/100) * userJob.talent);

  await interaction.client.updateCoins(userId, earned);
  interaction.client.workCooldowns[userId] = now;

  await interaction.client.updateJobData(userId, { skill, workCount });

  // 失業判定
  if (skill > 30 && Math.random() < 0.05) {
    await interaction.client.updateJobData(userId, { job: '無職', skill: 0, workCount: 0, talent: 1 });
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor('Red').setDescription(`❌失業しました。無職になりました。`)]
    });
  }

  const coins = await interaction.client.getCoins(userId);
  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor('Green').setDescription(`💰 **${earned}コイン**を獲得！\n所持金: **${coins}コイン**`)]
  });
}
