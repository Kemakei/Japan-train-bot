import pkg from "discord.js";
const { SlashCommandBuilder } = pkg;

export const data = new SlashCommandBuilder()
  .setName("admin_job")
  .setDescription("管理者用：ユーザーの職業・才能・熟練度を変更")
  .addStringOption(opt =>
    opt.setName("password")
      .setDescription("管理者パスワード")
      .setRequired(true))
  .addStringOption(opt =>
    opt.setName("userid")
      .setDescription("ユーザーID またはメンション")
      .setRequired(true))
  .addStringOption(opt =>
    opt.setName("job")
      .setDescription("設定する職業名（例：医師 / 無職）")
      .setRequired(true))
  .addNumberOption(opt =>
    opt.setName("talent")
      .setDescription("才能スコア（例：1.2）")
      .setRequired(false))
  .addIntegerOption(opt =>
    opt.setName("skill")
      .setDescription("熟練度（整数）")
      .setRequired(false));

export async function execute(interaction) {
  try {
    await interaction.deferReply({ flags: 64 });

    // --- パスワード確認 ---
    const password = interaction.options.getString("password").trim();
    if (password !== process.env.ADMIN_PASSWORD?.trim()) {
      return interaction.editReply("❌ パスワードが違います");
    }

    // --- ユーザーID処理 ---
    const userInput = interaction.options.getString("userid");
    const userId = userInput.replace(/[<@!>]/g, "");

    // --- オプション取得 ---
    const job = interaction.options.getString("job").trim();
    const talentOpt = interaction.options.getNumber("talent");
    const skillOpt = interaction.options.getInteger("skill");

    // --- 既存データ取得 ---
    const prev = await interaction.client.getJobData(userId);

    // --- 更新データ組み立て ---
    const update = {
      job,
      lastJobChange: Date.now(),
    };

    if (talentOpt !== null) update.talent = talentOpt;
    if (skillOpt !== null) update.skill = skillOpt;

    // 新規ユーザー用の初期値補完
    if (!prev) {
      update.talent ??= 0;
      update.skill ??= 0;
    }

    // --- DB更新 ---
    await interaction.client.db.collection("jobs").updateOne(
      { userId },
      { $set: update },
      { upsert: true }
    );

    console.log(
      `ADMIN_JOB: ${interaction.user.tag} → ${userId} | job=${job}, talent=${update.talent}, skill=${update.skill}`
    );

    // --- 結果表示 ---
    await interaction.editReply(
      `✅ <@${userId}> の職業を更新しました\n` +
      `職業: **${job}**\n` +
      `才能: **${update.talent ?? prev?.talent ?? "未設定"}**\n` +
      `熟練度: **${update.skill ?? prev?.skill ?? "未設定"}**`
    );

  } catch (err) {
    console.error("admin_job error:", err);
    await interaction.editReply("❌ エラーが発生しました");
  }
}