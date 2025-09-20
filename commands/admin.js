import { SlashCommandBuilder } from "discord.js";

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
  const password = interaction.options.getString("password");
  if (password !== process.env.ADMIN_PASSWORD)
    return interaction.reply({ content: "❌ パスワードが間違っています", ephemeral: true });

  const userInput = interaction.options.getString("userid");
  const userId = userInput.replace(/[<@!>]/g, "");
  const amount = interaction.options.getInteger("amount");

  const prev = interaction.client.getCoins(userId);
  interaction.client.setCoins(userId, prev + amount);

  await interaction.reply({ content: `✅ <@${userId}> のコインを ${amount} 変更しました（現在: ${interaction.client.getCoins(userId)}）`, ephemeral: true });
}
