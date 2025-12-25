import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const jobs = [
  { name: '無職', cost: 0, base: 0 },
  { name: 'ギャンブラー', cost: 0, base: 100 },
  { name: 'アルバイト', cost: 0, base: 800 },
  { name: '教師', cost: 3000, base: 2000 },
  { name: '銀行員', cost: 5000, base: 5000 },
  { name: 'ジャーナリスト', cost: 7000, base: 7000 },
  { name: 'プログラマー', cost: 10000, base: 10000 },
  { name: 'パイロット', cost: 30000, base: 15000 },
  { name: 'エンジニア', cost: 100000, base: 20000 },
  { name: '医師', cost: 300000, base: 50000 },
];

const licenseNeeded = {
  "教師": "教員免許状",
  "パイロット": "技能証明と航空身体検査証明",
  "エンジニア": "ITパスポート",
  "医師": "医師免許"
};

function randomTalent() {
  return +(Math.random() * (1.5 - 0.6) + 0.6).toFixed(2);
}

export const data = new SlashCommandBuilder()
  .setName('job')
  .setDescription('転職')
  .addStringOption(option => 
    option.setName('職業')
          .setDescription('希望の職業を入力してください')
          .setRequired(true)
  );

export async function execute(interaction) {
  const userId = interaction.user.id;
  const userJob = await interaction.client.getJobData(userId);

  // 入力された職業
  const inputJob = interaction.options.getString('職業');
  const targetJob = jobs.find(j => j.name === inputJob);

  if (!targetJob) {
    return interaction.reply({ content: `❌ **${inputJob}** は無効な職業です。`, ephemeral: true });
  }

  if (inputJob === userJob.job) {
    return interaction.reply({ content: `⚠️ 既に **${userJob.job}** に就いています。`, ephemeral: true });
  }

  // ライセンスチェック
  if (licenseNeeded[inputJob]) {
    const has = await interaction.client.hasLicense(userId, inputJob);
    if (!has) {
      return interaction.reply({ content: `❌ ${inputJob}に転職するには **${licenseNeeded[inputJob]}** が必要です。`, ephemeral: true });
    }
  }

  const coins = await interaction.client.getCoins(userId);
  if (coins < targetJob.cost) {
    return interaction.reply({ content: `❌ ${targetJob.cost}コイン必要です。所持: ${coins}`, ephemeral: true });
  }

  // 才能スコア確定
  const talent = randomTalent();

  // 転職成功確率 95%
  const fail = Math.random() < 0.05;
  let message;
  if (fail) {
    await interaction.client.updateCoins(userId, -targetJob.base);
    message = `❌ 転職に失敗しました。${targetJob.base}コインが失われました。`;
  } else {
    await interaction.client.updateCoins(userId, -targetJob.cost);
    await interaction.client.setJobData(userId, { job: targetJob.name, talent, skill: 0, workCount: 0, lastJobChange: Date.now() });
    message = `✅ **${targetJob.name}** に転職しました！\n才能スコア: **${talent.toFixed(2)}**`;
  }

  await interaction.reply({ content: message, ephemeral: true });
}
