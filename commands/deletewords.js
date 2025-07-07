import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('deletewords')
  .setDescription('指定した単語を含むメッセージを過去50件から削除します')
  .addStringOption(option =>
    option.setName('word1')
      .setDescription('単語1')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('word2')
      .setDescription('単語2')
      .setRequired(false))
  .addStringOption(option =>
    option.setName('word3')
      .setDescription('単語3')
      .setRequired(false))
  .addStringOption(option =>
    option.setName('word4')
      .setDescription('単語4')
      .setRequired(false));

export async function execute(interaction) {
  const words = [];
  for (let i = 1; i <= 4; i++) {
    const w = interaction.options.getString(`word${i}`);
    if (w) words.push(w.toLowerCase());
  }

  if (words.length === 0) {
    await interaction.reply({ content: '❌ 1つ以上の単語を入力してください。', ephemeral: true });
    return;
  }

  // 過去50件メッセージ取得
  const messages = await interaction.channel.messages.fetch({ limit: 50 });
  // 削除対象メッセージ絞り込み
  const toDelete = messages.filter(msg => {
    if (msg.author.bot) return false; // botメッセージは除外
    const contentLower = msg.content.toLowerCase();
    return words.some(word => contentLower.includes(word));
  });

  if (toDelete.size === 0) {
    await interaction.reply({ content: '⚠️ 指定された単語を含むメッセージは見つかりませんでした。', ephemeral: true });
    return;
  }

  // メッセージ削除（まとめて）
  try {
    for (const msg of toDelete.values()) {
      await msg.delete();
    }
    await interaction.reply({ content: `✅ ${toDelete.size} 件のメッセージを削除しました。`, ephemeral: true });
  } catch (error) {
    console.error('メッセージ削除エラー:', error);
    await interaction.reply({ content: '❌ メッセージ削除中にエラーが発生しました。', ephemeral: true });
  }
}
