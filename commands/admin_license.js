import { SlashCommandBuilder } from "discord.js";

const licensesList = [
  "教員免許状",
  "技能証明",
  "航空身体検査証明",
  "ITパスポート",
  "医師免許"
];

export const data = new SlashCommandBuilder()
  .setName("admin_license")
  .setDescription("ユーザーのライセンスを追加/剥奪")
  .addStringOption(opt =>
    opt.setName("password")
      .setDescription("管理者パスワード")
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName("userid")
      .setDescription("ユーザーID またはメンション")
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName("action")
      .setDescription("add:追加, remove:剥奪")
      .setRequired(true)
      .addChoices(
        { name: "追加", value: "add" },
        { name: "剥奪", value: "remove" }
      )
  )
  .addStringOption(opt =>
    opt.setName("license")
      .setDescription("対象ライセンス")
      .setRequired(true)
      // ★ 完全固定
      .addChoices(
        ...licensesList.map(l => ({ name: l, value: l }))
      )
  );

// --- 実行 ---
export async function execute(interaction) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    // --- パスワード ---
    const password = (interaction.options.getString("password") || "").trim();
    const adminPass = (process.env.ADMIN_PASSWORD || "").trim();
    if (password !== adminPass) {
      return await interaction.editReply("❌ パスワードが間違っています");
    }

    // --- ユーザーID ---
    const userInput = interaction.options.getString("userid");
    const userId = userInput.replace(/[<@!>]/g, "").trim();

    // --- action / license ---
    const action = interaction.options.getString("action");
    const license = interaction.options.getString("license");

    // 念のための安全チェック（実際は通らない）
    if (!licensesList.includes(license)) {
      return await interaction.editReply("❌ 無効なライセンスです");
    }

    // --- ユーザーのライセンス取得 ---
    const licensesDoc = await interaction.client.db
      .collection("licenses")
      .findOne({ userId });

    const userLicenses = licensesDoc?.licenses || {};

    if (action === "add") {
      if (userLicenses[license]) {
        return await interaction.editReply(
          `❌ ユーザーはすでに **${license}** を所有しています`
        );
      }

      await interaction.client.db.collection("licenses").updateOne(
        { userId },
        { $set: { [`licenses.${license}`]: true } },
        { upsert: true }
      );

      await interaction.editReply(
        `✅ <@${userId}> に **${license}** を追加しました`
      );

    } else if (action === "remove") {
      if (!userLicenses[license]) {
        return await interaction.editReply(
          `❌ ユーザーは **${license}** を持っていません`
        );
      }

      await interaction.client.db.collection("licenses").updateOne(
        { userId },
        { $unset: { [`licenses.${license}`]: "" } }
      );

      await interaction.editReply(
        `✅ <@${userId}> から **${license}** を剥奪しました`
      );

    } else {
      return await interaction.editReply(
        "❌ action は add または remove を指定してください"
      );
    }

  } catch (err) {
    console.error("❌ admin_license エラー:", err);
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({
        content: "❌ コマンド実行中にエラーが発生しました",
        flags: 64
      });
    } else {
      await interaction.editReply(
        "❌ コマンド実行中にエラーが発生しました"
      );
    }
  }
}