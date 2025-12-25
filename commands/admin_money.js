import pkg from "discord.js";
const { SlashCommandBuilder } = pkg;

export const data = new SlashCommandBuilder()
  .setName("admin_money")
  .setDescription("ユーザーのコインを変更")
  .addStringOption(opt => 
    opt.setName("password")
      .setDescription("管理者パスワード")
      .setRequired(true))
  .addStringOption(opt => 
    opt.setName("userid")
      .setDescription("ユーザーID またはメンション")
      .setRequired(true))
  .addIntegerOption(opt => 
    opt.setName("amount")
      .setDescription("増減するコイン")
      .setRequired(true));

export async function execute(interaction) {
  try {
    // defer（ephemeral）
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    // --- パスワード取得・比較 ---
    const password = (interaction.options.getString("password") || "").trim();
    const adminPass = (process.env.ADMIN_PASSWORD || "").trim();

    if (password !== adminPass) {
      return await interaction.editReply("❌ パスワードが間違っています");
    }

    // --- ユーザーID取得 ---
    const userInput = interaction.options.getString("userid");
    const userId = userInput.replace(/[<@!>]/g, "").trim();

    // --- コイン変更 (MongoDB版) ---
    const amount = interaction.options.getInteger("amount");
    const userDoc = await interaction.client.coinsCol.findOne({ userId });
    const prev = userDoc?.coins || 0;
    await interaction.client.coinsCol.updateOne(
      { userId },
      { $set: { coins: prev + amount } },
      { upsert: true }
    );

    // --- ログ出力 ---
    console.log(` ${interaction.user.tag} が <@${userId}> のコインを ${amount} 変更しました（元: ${prev} → 現在: ${prev + amount}）`);

    await interaction.editReply(
      `✅ <@${userId}> のコインを ${amount} 変更しました（現在: ${prev + amount}）`
    );

  } catch (err) {
    console.error(`❌ admin_money エラー:`, err);
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: "❌ コマンド実行中にエラーが発生しました", ephemeral: true });
    } else {
      await interaction.editReply("❌ コマンド実行中にエラーが発生しました");
    }
  }
}
