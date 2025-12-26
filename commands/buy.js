import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

// ===== 設定 =====
const INSURANCE_COST = 20000; // 価格
const INSURANCE_DURATION = 7 * 24 * 60 * 60 * 1000; // 1週間

// JST表示用
function formatJST(timestamp) {
  const d = new Date(timestamp + 9 * 60 * 60 * 1000);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

// ===== コマンド定義 =====
export const data = new SlashCommandBuilder()
  .setName("buy")
  .setDescription("アイテムを購入します")
  .addStringOption(opt =>
    opt.setName("item")
      .setDescription("購入するアイテム")
      .setRequired(true)
      .addChoices(
        { name: "失業保険（7日間）", value: "unemployment_insurance" }
      )
  );

// ===== 実行処理 =====
export async function execute(interaction) {
  const userId = interaction.user.id;
  const item = interaction.options.getString("item");

  if (item !== "unemployment_insurance") {
    return interaction.reply({
      content: "❌ 不明なアイテムです",
      flags: 64
    });
  }

  const now = Date.now();
  const jobData = await interaction.client.getJobData(userId);

  // --- 既に保険が有効か ---
  if (
    jobData.unemploymentInsurance &&
    jobData.unemploymentInsuranceExpires &&
    jobData.unemploymentInsuranceExpires > now
  ) {
    const until = formatJST(jobData.unemploymentInsuranceExpires);
    return interaction.reply({
      content: `⚠️ 既に失業保険が有効です（**${until} まで**）`,
      flags: 64
    });
  }

  // --- 所持金チェック ---
  const coins = await interaction.client.getCoins(userId);
  if (coins < INSURANCE_COST) {
    return interaction.reply({
      content: `❌ 失業保険の購入には **${INSURANCE_COST}コイン** 必要です（所持: ${coins}）`,
      flags: 64
    });
  }

  // --- 購入処理 ---
  const expiresAt = now + INSURANCE_DURATION;
  await interaction.client.updateCoins(userId, -INSURANCE_COST);

  await interaction.client.db.collection("jobs").updateOne(
    { userId },
    {
      $set: {
        unemploymentInsurance: true,
        unemploymentInsuranceExpires: expiresAt
      }
    },
    { upsert: true }
  );

  // --- 完了メッセージ ---
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor("Green")
        .setTitle("失業保険を購入しました")
        .setDescription(
          `有効期限：**${formatJST(expiresAt)} までで**\n` +
          `この期間中は失業しません。`
        )
    ],
    flags: 64
  });
}