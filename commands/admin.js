import pkg from "discord.js";
const { SlashCommandBuilder } = pkg;

export const data = new SlashCommandBuilder()
  .setName("admin")
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
      await interaction.deferReply({ flags: 64 });
    }

    // --- パスワード取得・比較 ---
    const password = (interaction.options.getString("password") || "").trim();
    const adminPass = (process.env.ADMIN_PASSWORD || "").trim();

    // ログ出力（デバッグ用）
    console.log(`[ADMIN] password entered: "${password}"`);
    console.log(`[ADMIN] adminPass env: "${adminPass}"`);

    if (password !== adminPass) {
      return await interaction.editReply("❌ パスワードが間違っています");
    }

    // --- ユーザーID取得 ---
    const userInput = interaction.options.getString("userid");
    const userId = userInput.replace(/[<@!>]/g, "").trim();

    // --- コイン変更 ---
    const amount = interaction.options.getInteger("amount");
    const prev = interaction.client.getCoins(userId) || 0;
    interaction.client.setCoins(userId, prev + amount);

    await interaction.editReply(
      `✅ <@${userId}> のコインを ${amount} 変更しました（現在: ${interaction.client.getCoins(userId)}）`
    );

  } catch (err) {
    console.error(err);
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: "❌ コマンド実行中にエラーが発生しました", flags: 64 });
    } else {
      await interaction.editReply("❌ コマンド実行中にエラーが発生しました");
    }
  }
}
