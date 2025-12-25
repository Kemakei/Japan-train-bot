import pkg from "discord.js";
const { SlashCommandBuilder } = pkg;

export const data = new SlashCommandBuilder()
  .setName("admin_vipcoin")
  .setDescription("ユーザーの金コインを変更")
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
      .setDescription("増減する金コイン数")
      .setRequired(true));

export async function execute(interaction) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    // --- パスワード認証 ---
    const password = (interaction.options.getString("password") || "").trim();
    const adminPass = (process.env.ADMIN_PASSWORD || "").trim();
    if (password !== adminPass) {
      return await interaction.editReply("❌ パスワードが間違っています");
    }

    // --- 対象ユーザー取得 ---
    const userInput = interaction.options.getString("userid");
    const userId = userInput.replace(/[<@!>]/g, "").trim();

    // --- 金コイン変更 ---
    const amount = interaction.options.getInteger("amount");
    const coinsCol = interaction.client.coinsCol;
    const userDoc = await coinsCol.findOne({ userId });
    const prev = userDoc?.VIPCoins || 0;
    const newAmount = Math.max(prev + amount, 0); // マイナス防止

    await coinsCol.updateOne(
      { userId },
      { $set: { VIPCoins: newAmount } },
      { upsert: true }
    );

    console.log(`🔑 ${interaction.user.tag} が <@${userId}> の金コインを ${amount} 変更しました（元: ${prev} → 現在: ${newAmount}）`);

    await interaction.editReply(
      `✅ <@${userId}> の金コインを ${amount} 変更しました（現在: ${newAmount}）`
    );

  } catch (err) {
    console.error("❌ admin_vipcoin エラー:", err);
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: "❌ コマンド実行中にエラーが発生しました", ephemeral: true });
    } else {
      await interaction.editReply("❌ コマンド実行中にエラーが発生しました");
    }
  }
}
