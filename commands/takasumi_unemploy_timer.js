import { SlashCommandBuilder } from 'discord.js';
import { request } from 'undici';

export const data = new SlashCommandBuilder()
  .setName('takasumi_unemploy_timer')
  .setDescription('[takasumi bot用]失業保険の期限切れリマインダーを設定')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('対象ユーザー')
  );

async function fetchUnemployExpireDate(userId) {
  let res;

  try {
    res = await request(
      `https://api.takasumibot.com/v3/history/${userId}`
    );
  } catch {
    throw new Error('takasumi bot側でエラーが発生しました');
  }

  if (res.statusCode !== 200) {
    throw new Error('takasumi bot側でエラーが発生しました');
  }

  let data;

  try {
    data = JSON.parse(await res.body.text());
  } catch {
    throw new Error('takasumi bot側でエラーが発生しました');
  }

  const history = Array.isArray(data) ? data.slice(-1000) : [];

  if (!history.length) return null;

  const latest = history
    .filter(h => h.reason === '失業保険の購入')
    .sort(
      (a, b) =>
        new Date(b.tradedAt).getTime() -
        new Date(a.tradedAt).getTime()
    )[0];

  if (!latest) return null;

  return new Date(
    new Date(latest.tradedAt).getTime() +
      7 * 24 * 60 * 60 * 1000
  );
}

async function checkUnemployTimers(client) {
  const col = client.db.collection('unemploy_timers');
  const now = Date.now();

  const expired = await col.find({
    expireAt: { $lte: now }
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
    } catch (err) {
      console.error('失業保険通知失敗:', err);
    } finally {
      await col.deleteOne({ _id: doc._id });
    }
  }
}

export async function execute(interaction, { client }) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({
      ephemeral: true
    });
  }

  if (!interaction.inGuild()) {
    return interaction.editReply({
      content: 'このコマンドはサーバー内でのみ使用できます'
    });
  }

  const targetUser =
    interaction.options.getUser('user') ?? interaction.user;

  const userId = targetUser.id;

  const col = client.db.collection('unemploy_timers');

  const existing = await col.findOne({
    userId,
    guildId: interaction.guildId
  });

  if (existing) {
    return interaction.editReply({
      content:
        '❌ すでに失業保険リマインダーが設定されています'
    });
  }

  let expireDate;

  try {
    expireDate = await fetchUnemployExpireDate(userId);
  } catch (err) {
    return interaction.editReply({
      content: err.message
    });
  }

  if (!expireDate) {
    return interaction.editReply({
      content: '❌ 失業保険の購入履歴が見つかりません'
    });
  }

  await col.updateOne(
    {
      userId,
      guildId: interaction.guildId
    },
    {
      $set: {
        userId,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        expireAt: expireDate.getTime()
      }
    },
    {
      upsert: true
    }
  );

  await interaction.editReply({
    content:
      `失業保険リマインダーを設定しました\n` +
      `${targetUser} の失業保険は ${expireDate.toLocaleString()} に期限切れになります`
  });
}

export async function scheduleUnemployCheck(client) {
  setInterval(() => {
    checkUnemployTimers(client).catch(err => {
      console.error('失業保険チェック失敗:', err);
    });
  }, 60 * 1000);
}