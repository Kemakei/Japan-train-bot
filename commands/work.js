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

// ランダム変動 -3%〜+5%
function applyVariance(amount) {
  const variance = Math.random() * 0.08 - 0.03;
  return Math.floor(amount * (1 + variance));
}

export const data = new SlashCommandBuilder()
  .setName('work')
  .setDescription('職業に応じてお金を稼ぎます');

export async function execute(interaction) {
  const userId = interaction.user.id;
  const now = Date.now();

  // ユーザージョブ取得
  let userJob = await interaction.client.getJobData(userId);
  if (!userJob) userJob = { job: '無職', talent: 1, skill: 0 };

  // 無職チェック
  if (userJob.job === '無職') {
    return interaction.reply({
      content: '❌ /job で職についてください',
      flags: 64
    });
  }

  // クールダウン管理
  if (!interaction.client.workCooldowns) interaction.client.workCooldowns = {};
  const lastWork = interaction.client.workCooldowns[userId] || 0;
  const cooldown = jobsInfo[userJob.job]?.cooldown || 0;
  if (cooldown > 0 && now - lastWork < cooldown) {
    const rem = cooldown - (now - lastWork);
    const m = Math.floor(rem / 60000);
    const s = Math.floor((rem % 60000) / 1000);
    return interaction.reply({
      content: `⏳ 次に働けるまで **${m}分${s}秒**です。`,
      flags: 64
    });
  }

  await interaction.deferReply();

  // 失業保険期限チェック
  if (
    userJob.unemploymentInsurance &&
    userJob.unemploymentInsuranceExpires &&
    userJob.unemploymentInsuranceExpires <= now
  ) {
    await interaction.client.db.collection("jobs").updateOne(
      { userId },
      { $set: { unemploymentInsurance: false }, $unset: { unemploymentInsuranceExpires: "" } }
    );
    userJob.unemploymentInsurance = false;
    userJob.unemploymentInsuranceExpires = 0;
  }

  // 給料計算 ((1/10*熟練度)*基本給)/100 + 基本給*才能
  const base = jobsInfo[userJob.job].base;
  const earnedBeforeVariance = (base * (userJob.skill / 10) / 100) + (base * userJob.talent);
  const earned = applyVariance(earnedBeforeVariance);

  await interaction.client.updateCoins(userId, earned);
  interaction.client.workCooldowns[userId] = now;

  // DBから最新情報取得
  const jobDocFromDB = await interaction.client.getJobData(userId);
  const hasInsurance = jobDocFromDB.unemploymentInsurance && jobDocFromDB.unemploymentInsuranceExpires > now;
  const userSkill = jobDocFromDB.skill || 0;

  // 失業判定
  if (!hasInsurance && userSkill > 30 && Math.random() < 0.05) {
    await interaction.client.updateJobData(userId, { job: '無職', skill: 0, workCount: 0, talent: 1 });
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setDescription('❌ 失業しました。無職になりました。')
      ]
    });
  }

  // 通常メッセージ
  const coins = await interaction.client.getCoins(userId);
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor('Green')
        .setDescription(`💰 **${earned}コイン**を獲得！\n所持金: **${coins}コイン**`)
    ]
  });
}