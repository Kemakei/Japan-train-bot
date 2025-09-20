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
    await interaction.deferReply({ ephemeral: true }); // まず defer

    const password = interaction.options.getString("password");
    if (password !== process.env.ADMIN_PASSWORD) {
      return await interaction.editReply("❌ パスワードが間違っています");
    }

    const userInput = interaction.options.getString("userid");
    const userId = userInput.replace(/[<@!>]/g, "");
    const amount = interaction.options.getInteger("amount");

    const prev = interaction.client.getCoins(userId);
    interaction.client.setCoins(userId, prev + amount);

    await interaction.editReply(
      `✅ <@${userId}> のコインを ${amount} 変更しました（現在: ${interaction.client.getCoins(userId)}）`
    );
  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("❌ コマンド実行中にエラーが発生しました");
    } else {
      await interaction.reply({ content: "❌ コマンド実行中にエラーが発生しました", ephemeral: true });
    }
  }
};
