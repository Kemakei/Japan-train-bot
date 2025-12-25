import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('addrole')
  .setDescription('新しい参加者に自動で付与するロールを設定します（空文字で解除）')
  .addStringOption(option =>
    option.setName('rolename')
      .setDescription('付与するロール名またはロールメンション')
      .setRequired(false)
  );

export async function execute(interaction) {
  const input = interaction.options.getString('rolename');
  const guild = interaction.guild;
  const guildId = guild.id;

  if (!input || input.trim() === '') {
    interaction.client.autoRoleMap.delete(guildId);
    await interaction.reply({ content: '✅ 自動付与ロール設定を解除しました。', flags: 64 });
    return;
  }

  let role;
  const mentionMatch = input.match(/^<@&(\d+)>$/);
  if (mentionMatch) {
    // メンション形式: <@&123456789>
    const roleId = mentionMatch[1];
    role = guild.roles.cache.get(roleId);
  } else {
    // 通常のロール名
    role = guild.roles.cache.find(r => r.name === input);
  }

  if (!role) {
    await interaction.reply({ content: '❌ 指定されたロールが見つかりません。', flags: 64 });
    return;
  }

  interaction.client.autoRoleMap.set(guildId, role.id); // 🔁 ロールIDで保存！
  await interaction.reply({ content: `✅ 今後このサーバーに参加したユーザーにはロール「${role.name}」を付与します。`, flags: 64});
}
