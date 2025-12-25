import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("admin_trade")
  .setDescription("管理者用: ユーザーの株数を編集")
  .addUserOption(opt => opt.setName("target").setDescription("対象ユーザー").setRequired(true))
  .addIntegerOption(opt => opt.setName("amount").setDescription("増減する株数").setRequired(true))
  .addStringOption(opt => opt.setName("action").setDescription("操作の種類").setRequired(true)
    .addChoices(
      { name: "増やす", value: "add" },
      { name: "減らす", value: "subtract" },
      { name: "設定", value: "set" }
    ))
  .addStringOption(opt => opt.setName("password").setDescription("管理者パスワード").setRequired(true));

export async function execute(interaction) {
  const password = interaction.options.getString("password");
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (password !== ADMIN_PASSWORD) {
    return interaction.reply({ content: "❌ パスワードが違います", ephemeral: true });
  }

  const user = interaction.options.getUser("target");
  const userId = user.id;
  const amount = interaction.options.getInteger("amount");
  const action = interaction.options.getString("action");
  const client = interaction.client;

  try {
    // MongoDB版：ユーザー情報取得
    const userDoc = await client.coinsCol.findOne({ userId });
    let current = userDoc?.stocks || 0;

    if (action === "add") current += amount;
    else if (action === "subtract") current = Math.max(0, current - amount);
    else if (action === "set") current = amount;

    // 保存
    await client.coinsCol.updateOne(
      { userId },
      { $set: { stocks: current } },
      { upsert: true }
    );

    console.log(`${interaction.user.tag} が ${user.tag} の株数を ${current} に更新しました`);
    return interaction.reply({ content: `✅ ${user.tag} の株数を ${current} に更新しました`, ephemeral: true });

  } catch (err) {
    console.error("❌ admin_trade エラー:", err);
    return interaction.reply({ content: "❌ 株数更新中にエラーが発生しました", ephemeral: true });
  }
}
