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
    const senderId = interaction.user.id;
    const targetInput = interaction.options.getString("user");
    const amount = interaction.options.getInteger("amount");

    const targetId = targetInput.replace(/[<@!>]/g, "").trim();
    const client = interaction.client;

    // 不正操作チェック
    if (targetId === senderId) {
      return await interaction.reply({
        content: "❌ 自分にコインを送ることはできません！",
        flags: 64
      });
    }

    if (amount <= 0) {
      return await interaction.reply({
        content: "❌ 送るコインは1以上で指定してください。",
        flags: 64
      });
    }

    const senderCoins = client.getCoins(senderId) || 0;
    if (amount > senderCoins) {
      return await interaction.reply({
        content: "❌ あなたの所持コインが足りません！",
        flags: 64
      });
    }

    // コイン移動
    client.updateCoins(senderId, -amount);
    const prevTargetCoins = client.getCoins(targetId) || 0;
    client.setCoins(targetId, prevTargetCoins + amount);

    // 成功メッセージは全員に見える
    await interaction.reply({
      content: `🎁 <@${senderId}> が <@${targetId}> に ${amount} コインを贈りました！\n` +
               `送信者の残りコイン: ${client.getCoins(senderId)}`,
      ephemeral: false
    });

  } catch (err) {
    console.error(err);
    // エラーは本人だけに見えるように
    if (!interaction.replied) {
      await interaction.reply({
        content: "❌ コマンド実行中にエラーが発生しました",
        flags: 64
      });
    } else {
      await interaction.editReply({
        content: "❌ コマンド実行中にエラーが発生しました"
      });
    }
  }
}
