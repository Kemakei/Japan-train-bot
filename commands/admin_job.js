import { SlashCommandBuilder } from "discord.js";

const JOBS = [
  "無職",
  "ギャンブラー",
  "アルバイト",
  "教師",
  "銀行員",
  "ジャーナリスト",
  "プログラマー",
  "パイロット",
  "エンジニア",
  "医師"
];

export const data = new SlashCommandBuilder()
  .setName("admin_job")
  .setDescription("ユーザーの職業・才能スコアを管理")
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
      .setDescription("設定する職業")
      .setRequired(true)
      .setAutocomplete(true))
  .addNumberOption(opt =>
    opt.setName("talent")
      .setDescription("才能スコア（0.6〜1.5、小数第一位まで）")
      .setRequired(true))
  .addIntegerOption(opt =>
    opt.setName("skill")
      .setDescription("熟練度")
      .setRequired(false));

// --- オートコンプリート ---
export async function handleAutocomplete(interaction) {
  if (!interaction.isAutocomplete()) return;
  const focused = interaction.options.getFocused();
  const choices = JOBS.filter(j => j.includes(focused)).slice(0, 10);
  await interaction.respond(choices.map(j => ({ name: j, value: j })));
}

// --- 実行 ---
export async function execute(interaction) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    // --- パスワード ---
    const password = (interaction.options.getString("password") || "").trim();
    if (password !== (process.env.ADMIN_PASSWORD || "").trim()) {
      return interaction.editReply("❌ パスワードが間違っています");
    }

    // --- ユーザーID ---
    const userInput = interaction.options.getString("userid");
    const userId = userInput.replace(/[<@!>]/g, "").trim();

    // --- 職業・才能・スキル ---
    const job = interaction.options.getString("job");
    if (!JOBS.includes(job)) return interaction.editReply("❌ 無効な職業です");

    let talent = interaction.options.getNumber("talent");
    // 0.6~1.5、少数第一位に丸める
    if (isNaN(talent) || talent < 0.6 || talent > 1.5) {
      return interaction.editReply("❌ talent は 0.6〜1.5 の範囲で指定してください");
    }
    talent = Math.round(talent * 10) / 10;

    const skill = interaction.options.getInteger("skill") ?? 0;

    // --- MongoDB 更新 ---
    await interaction.client.db.collection("jobs").updateOne(
      { userId },
      { $set: { job, talent, skill, lastJobChange: Date.now() } },
      { upsert: true }
    );

    await interaction.editReply(`✅ <@${userId}> の職業を **${job}** に設定しました\n才能: **${talent}** 熟練度: **${skill}**`);

  } catch (err) {
    console.error("❌ admin_job エラー:", err);
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: "❌ コマンド実行中にエラーが発生しました", flags: 64 });
    } else {
      await interaction.editReply("❌ コマンド実行中にエラーが発生しました");
    }
  }
}