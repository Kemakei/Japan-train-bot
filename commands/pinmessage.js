import { ContextMenuCommandBuilder, ApplicationCommandType } from 'discord.js';

export const data = new ContextMenuCommandBuilder()
  .setName('常に下に表示')
  .setType(ApplicationCommandType.Message);

export async function execute(interaction) {
  const client = interaction.client;
  const channel = interaction.channel;
  if (!channel) {
    await interaction.reply({ content: '⚠️ チャンネル情報が取得できません。', flags: 64 });
    return;
  }

  const channelId = channel.id;
  const targetMessage = await channel.messages.fetch(interaction.targetId);
  const isBotEmbed = targetMessage.author.id === client.user.id && targetMessage.embeds.length > 0;

  if (isBotEmbed) {
    // 固定解除処理
    const monitoredId = client.monitoredMessages.get(channelId);
    const lastCopyId = client.lastSentCopies.get(channelId);

    if (monitoredId === targetMessage.id || lastCopyId === targetMessage.id) {
      try {
        await targetMessage.delete();
      } catch {}

      client.monitoredMessages.delete(channelId);
      client.lastSentCopies.delete(channelId);

      await interaction.reply({ content: '✅ 固定を解除しました。', flags: 64 });
    } else {
      await interaction.reply({ content: '⚠️ このメッセージは現在固定されていません。', flags: 64 });
    }
    return;
  }

  // 監視登録
  client.monitoredMessages.set(channelId, targetMessage.id);
  // 以前の再送信メッセージがあれば削除
  const oldCopyId = client.lastSentCopies.get(channelId);
  if (oldCopyId) {
    try {
      const oldMsg = await channel.messages.fetch(oldCopyId);
      if (oldMsg) await oldMsg.delete();
    } catch {}
    client.lastSentCopies.delete(channelId);
  }

  await interaction.reply({ content: '📌 このメッセージを常に下に表示するようにしました。', flags: 64 });
}