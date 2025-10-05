import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('サーバー内のコインランキングを表示します');

export async function execute(interaction, { client }) {
  const guild = interaction.guild;
  if (!guild) return await interaction.reply({ content: '❌ ギルド情報が取得できません', flags: 64 });

  try {
    // 処理中応答
    await interaction.deferReply();

    // MongoDBから全ユーザー取得
    const allUsers = await client.coinsCol.find({}).toArray();

    // サーバーに存在するユーザーのみ抽出
    const serverUsersData = allUsers.filter(doc => !['stock_price', 'trade_history'].includes(doc.userId));

    // すべて個別取得（キャッシュは無視）
    const fetchedMembers = await Promise.all(
      serverUsersData.map(doc => guild.members.fetch(doc.userId).catch(() => null))
    );

    // 取得できたメンバーだけでランキング作成
    const ranking = serverUsersData
      .map((doc, index) => {
        const member = fetchedMembers[index];
        if (!member) return null; // サーバーにいない場合は除外
        return { userId: doc.userId, coins: doc.coins || 0, username: member.user.tag };
      })
      .filter(Boolean)
      .sort((a, b) => b.coins - a.coins);

    if (ranking.length === 0) return await interaction.editReply({ content: '❌ ランキングデータがありません' });

    const top10 = ranking.slice(0, 10);

    const embed = new EmbedBuilder()
      .setTitle('🏆 コインランキング')
      .setColor('#FFD700')
      .setTimestamp();

    let description = '';
    for (let i = 0; i < top10.length; i++) {
      const { username, coins } = top10[i];
      description += `**${i + 1}. ${username}** - 💰 ${coins} コイン\n`;
    }

    // 自分の順位も表示
    const userIndex = ranking.findIndex(r => r.userId === interaction.user.id);
    if (userIndex !== -1 && userIndex >= 10) {
      const { coins } = ranking[userIndex];
      description += `\n... \n**${userIndex + 1}. ${interaction.user.tag}** - 💰 ${coins} コイン`;
    }

    embed.setDescription(description);
    await interaction.editReply({ embeds: [embed] });

  } catch (err) {
    console.error(err);
    await interaction.editReply({ content: '❌ コマンド実行中にエラーが発生しました' });
  }
}
