import { SlashCommandBuilder } from 'discord.js';
import { request } from 'undici';

export const data = new SlashCommandBuilder()
  .setName('unemploy_timer')
  .setDescription('失業保険の期限切れリマインダーを設定')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('対象ユーザー'))

// APIから履歴取得・7日後算出
async function fetchUnemployExpireDate(userId) {
  let res;
  try {
    res = await request(`https://api.takasumibot.com/v3/history/${userId}`);
  } catch {
    throw new Error("takasumi bot側でエラーが発生しました");
  }

  if (res.statusCode !== 200) {
    throw new Error("takasumi bot側でエラーが発生しました");
  }

  let data;
  try {
    data = JSON.parse(await res.body.text());
  } catch {
    throw new Error("takasumi bot側でエラーが発生しました");
  }

  const history = Array.isArray(data) ? data : [];
  if (!history.length) return null;

  // 最新1000件に絞る
  const recentHistory = history.slice(-1000);

  // 「失業保険の購入」だけフィルターして最新を取得
  const latest = recentHistory
    .filter(h => h.reason === "失業保険の購入")
    .sort((a, b) => new Date(b.tradedAt) - new Date(a.tradedAt))[0];

  if (!latest) return null;

  return new Date(new Date(latest.tradedAt).getTime() + 7 * 24 * 60 * 60 * 1000);
}

// 期限切れチェックして通知
async function checkUnemployTimers(client) {
  const col = client.db.collection("unemploy_timers");
  const now = Date.now();

  const expired = await col.find({
    expireAt: { $lte: now },
    notified: false
  }).toArray();

  for (const doc of expired) {
    try {
      const guild = await client.guilds.fetch(doc.guildId);
      const channel = await guild.channels.fetch(doc.channelId);

      if (channel) {
        await channel.send(
          `<@${doc.userId}> takasumi botでの失業保険が切れました`
        );
      }
    } finally {
      await col.updateOne(
        { _id: doc._id },
        { $set: { notified: true } }
      );
    }
  }
}

// コマンド実行
export async function execute(interaction, { client }) {
  const targetUser = interaction.options.getUser('user') || interaction.user;
  const userId = targetUser.id;

  const expireDate = await fetchUnemployExpireDate(userId);
  if (!expireDate) {
    await interaction.reply({ content: '❌失業保険の購入履歴が見つかりません', ephemeral: true });
    return;
  }

  // MongoDBに保存
  const col = client.db.collection('unemploy_timers');
  await col.updateOne(
    { userId, guildId: interaction.guildId },
    {
      $set: {
        userId,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        expireAt: expireDate.getTime(),
        notified: false
      }
    },
    { upsert: true }
  );

  await interaction.reply({
    content: `${targetUser} の失業保険は ${expireDate.toLocaleString()} に期限切れになります`
  });
}

// Bot起動時に1分ごとチェック
export async function scheduleUnemployCheck(client) {
  setInterval(() => {
    checkUnemployTimers(client)
      .catch(err => console.error("失業保険チェック失敗:", err));
  }, 60 * 1000);
}
