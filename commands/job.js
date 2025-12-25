export async function execute(interaction) {
  const userId = interaction.user.id;
  const userJob = await interaction.client.getJobData(userId);

  const now = Date.now();
  const COOLDOWN = 5 * 60 * 1000; // 5分

  // クールダウンチェック
  if (userJob.lastJobChange && now - userJob.lastJobChange < COOLDOWN) {
    const rem = COOLDOWN - (now - userJob.lastJobChange);
    const m = Math.floor(rem / 60000);
    const s = Math.floor((rem % 60000) / 1000);
    return interaction.reply({ content: `⏳ 転職は5分に1回のみ可能です。次に転職可能になるまで **${m}分${s}秒**です。`, flags: 64 });
  }

  const inputJob = interaction.options.getString('職業');
  const targetJob = jobs.find(j => j.name === inputJob);

  if (!targetJob) {
    return interaction.reply({ content: `❌ **${inputJob}** は無効な職業です。`, flags: 64 });
  }

  if (inputJob === userJob.job) {
    return interaction.reply({ content: `⚠️ 既に **${userJob.job}** に就いています。`, flags: 64 });
  }

  // ライセンスチェック
  if (licenseNeeded[inputJob]) {
    const has = await interaction.client.hasLicense(userId, inputJob);
    if (!has) {
      return interaction.reply({ content: `❌ ${inputJob}に転職するには **${licenseNeeded[inputJob]}** が必要です。/licenseで入手してください。`, flags: 64 });
    }
  }

  const coins = await interaction.client.getCoins(userId);
  if (coins < targetJob.cost) {
    return interaction.reply({ content: `❌ ${targetJob.cost}コイン必要です。所持: ${coins}`, flags: 64 });
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
    await interaction.client.setJobData(userId, {
      job: targetJob.name,
      talent,
      skill: 0,
      workCount: 0,
      lastJobChange: now 
    });
    message = `✅ **${targetJob.name}** に転職しました！\n才能スコア: **${talent}**`;
  }

  await interaction.reply({ content: message, flags: 64 });
}
