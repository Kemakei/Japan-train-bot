import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('サーバー内のコインランキングを表示します');

export async function execute(interaction, { client }) {
  const guild = interaction.guild;
  if (!guild) return await interaction.reply({ content: '❌ ギルド情報が取得できません', flags: 64 });

  try {
    // MongoDB版：全ユーザーデータ取得
    const allUsers = await client.coinsCol.find({}).toArray();

    const ranking = allUsers
      .filter(doc => !['stock_price', 'trade_history'].includes(doc.userId))
      .map(doc => ({ userId: doc.userId, coins: doc.coins || 0 }))
      .sort((a, b) => b.coins - a.coins);

    if (ranking.length === 0) return await interaction.reply({ content: '❌ ランキングデータがありません', flags: 64 });

    // 上位10人
    const top10 = ranking.slice(0, 10);

    // Embed作成
    const embed = new EmbedBuilder()
      .setTitle('🏆 コインランキング')
      .setColor('#FFD700')
      .setTimestamp();

    let description = '';
    for (let i = 0; i < top10.length; i++) {
      const { userId, coins } = top10[i];
      const member = await guild.members.fetch(userId).catch(() => null);
      const username = member ? member.user.tag : '不明なユーザー';
      description += `**${i + 1}. ${username}** - 💰 ${coins} コイン\n`;
    }

    // 自分の順位も表示
    const userIndex = ranking.findIndex(r => r.userId === interaction.user.id);
    if (userIndex !== -1 && userIndex >= 10) {
      const { coins } = ranking[userIndex];
      description += `\n... \n**${userIndex + 1}. ${interaction.user.tag}** - 💰 ${coins} コイン`;
    }

    embed.setDescription(description);

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    console.error(err);
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: '❌ コマンド実行中にエラーが発生しました', flags: 64 });
    } else {
      await interaction.editReply({ content: '❌ コマンド実行中にエラーが発生しました', flags: 64 });
    }
  }
}
