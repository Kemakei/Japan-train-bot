import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("gift")
  .setDescription("指定したユーザーにコインを送ります")
  .addStringOption(option =>
    option
      .setName("user")
      .setDescription("ユーザーID またはメンション")
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option
      .setName("amount")
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
      return await interaction.reply({
        content: "❌ 無効なユーザー指定です。",
        flags: 64
      });
    }

    // --- 自分に送れない ---
    if (targetId === senderId) {
      return await interaction.reply({
        content: "❌ 自分にコインを送ることはできません！",
        flags: 64
      });
    }

    // --- 金額チェック ---
    if (amount <= 0) {
      return await interaction.reply({
        content: "❌ 送るコインは1以上で指定してください。",
        flags: 64
      });
    }

    // --- 手数料計算（20%、切り上げ） ---
    const fee = Math.ceil(amount * 0.2);
    const totalCost = amount + fee;

    // --- 送信者の所持金チェック ---
    const senderCoins = await client.getCoins(senderId);

    if (senderCoins < totalCost) {
      const maxAmount = Math.floor(senderCoins / 1.2);

      return await interaction.reply({
        content:
          `❌ コインが足りません！\n` +
          `手数料: **${fee}**\n` +
          `現在送れる最大金額: **${maxAmount} コイン**`,
        flags: 64
      });
    }

    // --- 送信先ユーザー取得 ---
    const targetUser = await client.users.fetch(targetId).catch(() => null);
    if (!targetUser) {
      return await interaction.reply({
        content: "❌ 指定したユーザーが見つかりません。",
        flags: 64
      });
    }

    // --- Botに送れない ---
    if (targetUser.bot) {
      return await interaction.reply({
        content: "❌ Botにコインを送ることはできません。",
        flags: 64
      });
    }

    // --- コイン移動 ---
    await client.updateCoins(senderId, -totalCost);
    await client.updateCoins(targetId, amount);

    const remaining = await client.getCoins(senderId);
    const receiverCoins = await client.getCoins(targetId);

    // --- 成功メッセージ ---
    await interaction.reply({
      content:
        `<@${senderId}> が <@${targetId}> に **${amount} コイン** を贈りました！\n` +
        `手数料: **${fee} コイン**\n` +
        `<@${senderId}> の所持金: **${remaining}**\n` +
        `<@${targetId}> の所持金: **${receiverCoins}**`,
      ephemeral: false
    });

  } catch (err) {
    console.error("Gift command error:", err);

    if (!interaction.replied) {
      await interaction.reply({
        content: "❌ コマンド実行中にエラーが発生しました。",
        flags: 64
      });
    } else {
      await interaction.editReply({
        content: "❌ コマンド実行中にエラーが発生しました。"
      });
    }
  }
}