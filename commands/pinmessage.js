import { ContextMenuCommandBuilder, ApplicationCommandType } from 'discord.js';

export const data = new ContextMenuCommandBuilder()
  .setName('常に下に表示')
  .setType(ApplicationCommandType.Message);

export async function execute(interaction) {
  const client = interaction.client;
  const channel = interaction.channel;

  if (!channel) {
    return interaction.reply({
      content: '⚠️ チャンネル情報が取得できません。',
      flags: 64,
    });
  }

  const channelId = channel.id;
  const targetMessage = await channel.messages.fetch(interaction.targetId);

  // ❗ 空チェック（追加部分）
  const isEmpty =
    !targetMessage.content &&
    targetMessage.embeds.length === 0 &&
    targetMessage.attachments.size === 0;

  if (isEmpty) {
    return interaction.reply({
      content: '⚠️ このメッセージには表示できる内容がありません。',
      flags: 64,
    });
  }

  // Botが送信したEmbed付きメッセージなら固定解除
  const isBotEmbed =
    targetMessage.author.id === client.user.id &&
    targetMessage.embeds.length > 0;

  if (isBotEmbed) {
    const monitoredId = client.monitoredMessages.get(channelId);
    const lastCopyId = client.lastSentCopies.get(channelId);

    if (
      monitoredId === targetMessage.id ||
      lastCopyId === targetMessage.id
    ) {
      try {
        await targetMessage.delete();
      } catch {}

      client.monitoredMessages.delete(channelId);
      client.lastSentCopies.delete(channelId);

      return interaction.reply({
        content: '✅ 固定を解除しました。',
        flags: 64,
      });
    }

    return interaction.reply({
      content: '⚠️ このメッセージは現在固定されていません。',
      flags: 64,
    });
  }

  // 監視登録
  client.monitoredMessages.set(channelId, targetMessage.id);

  // 古いコピー削除
  const oldCopyId = client.lastSentCopies.get(channelId);

  if (oldCopyId) {
    try {
      const oldMsg = await channel.messages.fetch(oldCopyId);
      await oldMsg.delete();
    } catch {}

    client.lastSentCopies.delete(channelId);
  }

  // 再送信
  const sentMessage = await channel.send({
    content: targetMessage.content || undefined,
    embeds: targetMessage.embeds,
    components: targetMessage.components,
    files: [...targetMessage.attachments.values()],
    allowedMentions: {
      parse: [],
    },
  });

  client.lastSentCopies.set(channelId, sentMessage.id);

  await interaction.reply({
    content: '📌 このメッセージを常に下に表示するようにしました。',
    flags: 64,
  });
}