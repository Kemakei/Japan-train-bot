import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} from 'discord.js';
import { DateTime } from 'luxon';

export const data = new SlashCommandBuilder()
  .setName('reminder')
  .setDescription('指定時間後または日時にリマインドします')
  .addStringOption(option =>
    option
      .setName('time')
      .setDescription('分後（例: 5）または日時 MM/DD HH:mm（例: 12/31 14:30）')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('message')
      .setDescription('リマインドメッセージ（止められる人はここでメンション）')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('timezone')
      .setDescription('タイムゾーン（例: UTC, +7, -8。未指定でUTC）')
      .setRequired(false)
  )
  .addBooleanOption(option =>
    option
      .setName('snooze')
      .setDescription('スヌーズを有効にするか（true/false）')
      .setRequired(false)
  );

export async function execute(interaction, { client }) {
  const timeInput = interaction.options.getString('time');
  const messageText = interaction.options.getString('message') || '';
  const tzInput = interaction.options.getString('timezone') || 'UTC';
  const snoozeRequested = interaction.options.getBoolean('snooze') || false;
  const userMention = `<@${interaction.user.id}>`;
  const reminderId = Date.now();

  if (!client.reminders) client.reminders = new Map();

  /* =========================
     スヌーズ停止許可ユーザー
     ========================= */
  const allowedUserIds = new Set([interaction.user.id]);

  // message に明示的に書かれたメンションだけ追加
  const mentionMatches = messageText.match(/<@!?(\d+)>/g);
  if (mentionMatches) {
    for (const m of mentionMatches) {
      const id = m.match(/\d+/)[0];
      allowedUserIds.add(id);
    }
  }

  /* =========================
     タイムゾーン処理
     ========================= */
  let tz = 'UTC';
  if (/^[+-]?\d+$/.test(tzInput)) {
    tz = `UTC${tzInput.startsWith('+') || tzInput.startsWith('-') ? tzInput : '+' + tzInput}`;
  } else {
    tz = tzInput.toUpperCase();
  }

  let delayMs;
  let isDatetime = false;

  if (/^\d+$/.test(timeInput)) {
    delayMs = parseInt(timeInput, 10) * 60 * 1000;
  } else {
    const match = timeInput.match(/^(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})$/);
    if (!match) {
      return interaction.reply({
        content: '❌ 時間形式が無効です。数字（分後）か MM/DD HH:mm を指定してください。',
        flags: 64
      });
    }

    isDatetime = true;
    const [, month, day, hour, minute] = match.map(Number);
    const now = DateTime.now().setZone(tz);
    let dt = DateTime.fromObject(
      { year: now.year, month, day, hour, minute },
      { zone: tz }
    );

    if (dt.toMillis() <= Date.now()) dt = dt.plus({ years: 1 });
    delayMs = dt.toMillis() - Date.now();
  }

  const snooze = isDatetime ? false : snoozeRequested;
  const warningMsg =
    isDatetime && snoozeRequested
      ? '\n⚠️ 日時指定ではスヌーズは無効になります。'
      : '';

  let lastMessage = null;

  /* =========================
     リマインダー送信処理
     ========================= */
  const sendReminder = async () => {
    const content = messageText
      ? `${userMention}  ${messageText}`
      : `${userMention} リマインド時間になりました！`;

    // 古いボタンを無効化
    if (lastMessage) {
      try {
        await lastMessage.edit({ components: [] });
      } catch {}
    }

    const row = snooze
      ? new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`stop_snooze_${reminderId}`)
            .setLabel('スヌーズをストップ')
            .setStyle(ButtonStyle.Danger)
        )
      : null;

    const msg = await interaction.channel.send({
      content,
      components: snooze ? [row] : []
    });

    lastMessage = msg;

    /* =========================
       スヌーズ停止ボタン監視
       ========================= */
    if (snooze) {
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 7 * 24 * 60 * 60 * 1000
      });

      collector.on('collect', async i => {
        if (i.customId !== `stop_snooze_${reminderId}`) return;

        // 🔐 権限制御
        if (!allowedUserIds.has(i.user.id)) {
          return i.reply({
            content: '❌ このスヌーズを停止する権限がありません。',
            flags: 64
          });
        }

        await i.deferUpdate();

        const active = client.reminders.get(reminderId);
        if (active) clearTimeout(active);
        client.reminders.delete(reminderId);

        await msg.edit({
          content: '⏹ スヌーズを停止しました',
          components: []
        });

        collector.stop('stopped_by_user');
      });
    }

    // スヌーズ再スケジュール
    if (!isDatetime && snooze && client.reminders.has(reminderId)) {
      const nextTimeout = setTimeout(sendReminder, delayMs);
      client.reminders.set(reminderId, nextTimeout);
    } else if (isDatetime) {
      client.reminders.delete(reminderId);
    }
  };

  /* =========================
     初回セット
     ========================= */
  const initialTimeout = setTimeout(async () => {
    await sendReminder();
    if (!snooze) client.reminders.delete(reminderId);
  }, delayMs);

  client.reminders.set(reminderId, initialTimeout);

  await interaction.reply({
    content: `⏰ リマインダーをセットしました（タイムゾーン: ${tz}, スヌーズ: ${snoozeRequested}）${warningMsg}`,
    flags: 64
  });
}