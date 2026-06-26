import { ContextMenuCommandBuilder, ApplicationCommandType, EmbedBuilder } from 'discord.js';

export const data = new ContextMenuCommandBuilder()
  .setName('常に下に表示')
  .setType(ApplicationCommandType.Message);

export async function execute(interaction) {
  const client = interaction.client;
  const channel = interaction.channel;

  if (!channel) {
    await interaction.reply({
      content: '⚠️ チャンネル情報が取得できません。',
      flags: 64
    });
    return;
  }

  const channelId = channel.id;
  const targetMessage = await channel.messages.fetch(interaction.targetId);

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

      await interaction.reply({
        content: '✅ 固定を解除しました。',
        flags: 64
      });
    } else {
      await interaction.reply({
        content: '⚠️ このメッセージは現在固定されていません。',
        flags: 64
      });
    }
    return;
  }

  // 内容チェック
  if (
    targetMessage.content.trim().length === 0 &&
    targetMessage.attachments.size === 0
  ) {
    await interaction.reply({
      content: '⚠️ このメッセージには表示する内容がありません。',
      flags: 64
    });
    return;
  }

  // 以前の固定を削除
  const oldCopyId = client.lastSentCopies.get(channelId);
  if (oldCopyId) {
    try {
      const oldMsg = await channel.messages.fetch(oldCopyId);
      await oldMsg.delete();
    } catch {}

    client.lastSentCopies.delete(channelId);
  }

  // 監視登録
  client.monitoredMessages.set(channelId, targetMessage.id);

  // Embed作成
  let description = targetMessage.content || "";

  const files = [];
  for (const attachment of targetMessage.attachments.values()) {
    files.push({
      attachment: attachment.url,
      name: attachment.name
    });
  }

  if (description) description += "\n";

  const embed = new EmbedBuilder()
    .setAuthor({
      name: targetMessage.author.tag,
      iconURL: targetMessage.author.displayAvatarURL()
    })
    .setDescription(description.trim())
    .setColor("#00AAFF");

  if (files.length) {
    embed.setImage(`attachment://${files[0].name}`);
  }

  const sent = await channel.send({
    embeds: [embed],
    files
  });

  client.lastSentCopies.set(channelId, sent.id);

  await interaction.reply({
    content: '📌 このメッセージを常に下に表示するようにしました。',
    flags: 64
  });
}