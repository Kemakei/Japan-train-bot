import { SlashCommandBuilder } from 'discord.js';

const jobs = [
  { name: '無職', cost: 0, base: 0 },
  { name: 'ギャンブラー', cost: 0, base: 100 },
  { name: 'アルバイト', cost: 0, base: 800 },
  { name: '教師', cost: 3000, base: 4000 },
  { name: '銀行員', cost: 5000, base: 5000 },
  { name: 'ジャーナリスト', cost: 7000, base: 7000 },
  { name: 'プログラマー', cost: 10000, base: 10000 },
  { name: 'パイロット', cost: 30000, base: 15000 },
  { name: 'エンジニア', cost: 100000, base: 20000 },
  { name: '医師', cost: 300000, base: 50000 },
];

const licenseNeeded = {
  教師: ['教員免許状'],
  パイロット: ['技能証明', '航空身体検査証明'],
  エンジニア: ['ITパスポート'],
  医師: ['医師免許']
};

// 転職後のクールダウン（5分）
const JOB_COOLDOWN = 5 * 60 * 1000;

// ランダム才能
function randomTalent() {
  return +(Math.random() * (1.5 - 0.6) + 0.6).toFixed(1);
}

// --- スラッシュコマンド定義 ---
export const data = new SlashCommandBuilder()
  .setName('job')
  .setDescription('転職')
  .addStringOption(option =>
    option
      .setName('職業')
      .setDescription('希望の職業を選択してください')
      .setRequired(true)
      // ★ 完全固定プルダウン
      .addChoices(
        ...jobs.map(j => ({
          name: `${j.name}：${j.cost.toLocaleString()}コイン`,
          value: j.name // ← MongoDB に入るのは職業名だけ
        }))
      )
  );

// --- 実行 ---
export async function execute(interaction) {
  const userId = interaction.user.id;
  const userJob = await interaction.client.getJobData(userId);
  const now = Date.now();

  // --- クールダウン ---
  if (userJob.lastJobChange && now - userJob.lastJobChange < JOB_COOLDOWN) {
    const rem = JOB_COOLDOWN - (now - userJob.lastJobChange);
    const m = Math.floor(rem / 60000);
    const s = Math.floor((rem % 60000) / 1000);
    return interaction.reply({
      content: `⏳ 転職はまだ **${m}分${s}秒** 待つ必要があります。`,
      flags: 64
    });
  }

  const inputJob = interaction.options.getString('職業');
  const targetJob = jobs.find(j => j.name === inputJob);

  // 念のため（実際は通らない）
  if (!targetJob) {
    return interaction.reply({
      content: `❌ **${inputJob}** は無効な職業です。`,
      flags: 64
    });
  }

  if (inputJob === userJob.job) {
    return interaction.reply({
      content: `⚠️ 既に **${userJob.job}** に就いています。`,
      flags: 64
    });
  }

  // --- ライセンスチェック ---
  if (licenseNeeded[inputJob]) {
    const needLicenses = licenseNeeded[inputJob];
    for (const lic of needLicenses) {
      const has = await interaction.client.hasLicense(userId, lic);
      if (!has) {
        return interaction.reply({
          content: `❌ ${inputJob}に転職するには **${needLicenses.join('・')}** が必要です。`,
          flags: 64
        });
      }
    }
  }

  // --- コインチェック ---
  const coins = await interaction.client.getCoins(userId);
  if (coins < targetJob.cost) {
    return interaction.reply({
      content: `❌ ${targetJob.cost.toLocaleString()}コイン必要です。所持: ${coins.toLocaleString()}`,
      flags: 64
    });
  }

  // --- 才能確定 ---
  const talent = randomTalent();

  // --- 成功判定（95%） ---
  const fail = Math.random() < 0.05;
  let message;

  if (fail) {
    await interaction.client.updateCoins(userId, -targetJob.base);
    message = `❌ 転職に失敗しました。${targetJob.base.toLocaleString()}コインが失われました。`;
  } else {
    await interaction.client.updateCoins(userId, -targetJob.cost);
    await interaction.client.setJobData(userId, {
      job: targetJob.name, // ← DBにはこれだけ
      talent,
      skill: 0,
      workCount: 0,
      lastJobChange: now
    });
    message = `✅ **${targetJob.name}** に転職しました！\n才能スコア: **${talent}**`;
  }

  await interaction.reply({ content: message, flags: 64 });
}