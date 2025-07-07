import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('addrole')
  .setDescription('新しい参加者に自動で付与するロールを設定します（空文字で解除）')
  .addStringOption(option =>
    option.setName('rolename')
      .setDescription('付与するロール名')
      .setRequired(false)
  );

export async function execute(interaction) {
  const roleName = interaction.options.getString('rolename');
  const guildId = interaction.guild.id;

  if (!roleName || roleName.trim() === '') {
    interaction.client.autoRoleMap.delete(guildId);
    await interaction.reply({ content: '✅ 自動付与ロール設定を解除しました。', ephemeral: true });
    return;
  }

  interaction.client.autoRoleMap.set(guildId, roleName);
  await interaction.reply({ content: `✅ 今後このサーバーに参加したユーザーにはロール「${roleName}」を付与します。`, ephemeral: true });
}
