import pkg from "discord.js";
const { SlashCommandBuilder } = pkg;

export const data = new SlashCommandBuilder()
  .setName("admin_license")
  .setDescription("管理者用：ライセンス付与・剥奪")
  .addStringOption(opt =>
    opt.setName("password")
      .setDescription("管理者パスワード")
      .setRequired(true))
  .addStringOption(opt =>
    opt.setName("userid")
      .setDescription("ユーザーID またはメンション")
      .setRequired(true))
  .addStringOption(opt =>
    opt.setName("license")
      .setDescription("ライセンス名（例：医師）")
      .setRequired(true))
  .addBooleanOption(opt =>
    opt.setName("grant")
      .setDescription("true=付与 / false=剥奪")
      .setRequired(true));

export async function execute(interaction) {
  try {
    await interaction.deferReply({ flags: 64 });

    const password = interaction.options.getString("password").trim();
    if (password !== process.env.ADMIN_PASSWORD?.trim()) {
      return interaction.editReply("❌ パスワードが違います");
    }

    const userInput = interaction.options.getString("userid");
    const userId = userInput.replace(/[<@!>]/g, "");

    const license = interaction.options.getString("license").trim();
    const grant = interaction.options.getBoolean("grant");

    if (grant) {
      await interaction.client.db.collection("licenses").updateOne(
        { userId },
        { $set: { [`licenses.${license}`]: true } },
        { upsert: true }
      );
    } else {
      await interaction.client.db.collection("licenses").updateOne(
        { userId },
        { $unset: { [`licenses.${license}`]: "" } }
      );
    }

    console.log(`ADMIN_LICENSE: ${interaction.user.tag} → ${userId} ${license} ${grant}`);

    await interaction.editReply(
      `✅ <@${userId}> の **${license}** ライセンスを ${grant ? "付与" : "剥奪"} しました`
    );

  } catch (err) {
    console.error("admin_license error:", err);
    await interaction.editReply("❌ エラーが発生しました");
  }
}