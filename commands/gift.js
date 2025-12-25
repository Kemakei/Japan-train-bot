import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("gift")
  .setDescription("指定したユーザーにコインを送ります")
  .addStringOption(option =>
    option.setName("user")
      .setDescription("ユーザーID またはメンション")
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName("amount")
      .setDescription("送るコインの量")
      .setRequired(true)
  );

export async function execute(interaction) {
  try {
    const client = interaction.client;
    const senderId = interaction.user.id;
    const targetInput = interaction.options.getString("user");
    const amount = interaction.options.getInteger("amount");

    // --- ユーザーID抽出（メンション or ID） ---
    const targetId = targetInput.replace(/[<@!>]/g, "").trim();
    if (!/^\d+$/.test(targetId)) {
      return await interaction.reply({ content: "❌ 無効なユーザー指定です。", ephemeral: true });
    }

    // --- 自分に送れない ---
    if (targetId === senderId) {
      return await interaction.reply({ content: "❌ 自分にコインを送ることはできません！", ephemeral: true });
    }

    // --- 金額チェック ---
    if (amount <= 0) {
      return await interaction.reply({ content: "❌ 送るコインは1以上で指定してください。", ephemeral: true });
    }

    // --- 送信者の所持金チェック ---
    const senderCoins = await client.getCoins(senderId);
    if (senderCoins < amount) {
      return await interaction.reply({
        content: `❌ コインが足りません！（所持: ${senderCoins}, 必要: ${amount}）`,
        ephemeral: true
      });
    }

    // --- 送信先ユーザー確認 ---
    const targetUser = await client.users.fetch(targetId).catch(() => null);
    if (!targetUser) {
      return await interaction.reply({ content: "❌ 指定したユーザーが見つかりません。", ephemeral: true });
    }

    // --- コイン移動 ---
    // 送信者の残高を差分減算
    await client.updateCoins(senderId, -amount);

    // 受信者の残高を取得して、setCoins で上書き
    const targetCoins = await client.getCoins(targetId) || 0;
    await client.setCoins(targetId, targetCoins + amount);

    const remaining = await client.getCoins(senderId);

    // --- 成功メッセージ（全員に公開） ---
    await interaction.reply({
      content: `🎁 <@${senderId}> が <@${targetId}> に **${amount} コイン** を贈りました！\n💰 送信者の残りコイン: ${remaining}`,
      ephemeral: false
    });

  } catch (err) {
    console.error("Gift command error:", err);
    if (!interaction.replied) {
      await interaction.reply({ content: "❌ コマンド実行中にエラーが発生しました。", ephemeral: true });
    } else {
      await interaction.editReply({ content: "❌ コマンド実行中にエラーが発生しました。" });
    }
  }
}
