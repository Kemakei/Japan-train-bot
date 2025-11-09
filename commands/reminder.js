import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { DateTime } from 'luxon';

export const reminders = new Map();

export const data = new SlashCommandBuilder()
  .setName('reminder')
  .setDescription('指定時間後または日時にリマインドします')
  .addStringOption(option =>
    option.setName('time')
      .setDescription('分後（例: 5）または日時 MM/DD HH:mm（例: 12/31 14:30）')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('message')
      .setDescription('リマインドメッセージ')
      .setRequired(false))
  .addStringOption(option =>
    option.setName('timezone')
      .setDescription('タイムゾーン（例: UTC, +7, -8。未指定でUTC）')
      .setRequired(false))
  .addBooleanOption(option =>
    option.setName('snooze')
      .setDescription('スヌーズを有効にするか（true/false）')
      .setRequired(false));

export async function execute(interaction, { client }) {
  const timeInput = interaction.options.getString('time');
  const messageText = interaction.options.getString('message') || '';
  const tzInput = interaction.options.getString('timezone') || 'UTC';
  const snooze = interaction.options.getBoolean('snooze') || false;
  const userMention = `<@${interaction.user.id}>`;
  const reminderId = Date.now();

  // タイムゾーン処理
  let tz = 'UTC';
  if (/^[+-]?\d+$/.test(tzInput)) {
    tz = `UTC${tzInput.startsWith('+') || tzInput.startsWith('-') ? tzInput : '+' + tzInput}`;
  } else {
    tz = tzInput.toUpperCase();
  }

  let delayMs;

  // 分後か日時か判定
  if (/^\d+$/.test(timeInput)) {
    delayMs = parseInt(timeInput) * 60 * 1000;
  } else {
    const match = timeInput.match(/^(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})$/);
    if (!match) {
      return interaction.reply({ content: '❌ 時間形式が無効です。数字（分後）か MM/DD HH:mm を指定してください。', flags: 64 });
    }

    const [, month, day, hour, minute] = match.map(Number);
    let now = DateTime.now().setZone(tz);
    let dt = DateTime.fromObject({ year: now.year, month, day, hour, minute }, { zone: tz });

    if (dt.toMillis() <= Date.now()) dt = dt.plus({ years: 1 });

    delayMs = dt.toMillis() - Date.now();
  }

  const sendReminder = async () => {
    const content = messageText
      ? `${userMention} リマインド: ${messageText}`
      : `${userMention} リマインド時間になりました！`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`stop_snooze_${reminderId}`)
        .setLabel('スヌーズをストップ')
        .setStyle(ButtonStyle.Danger)
    );

    const msg = await interaction.channel.send({ content, components: [row] });

    if (snooze) {
      // ボタン操作を監視してスヌーズ停止
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 24 * 60 * 60 * 1000 // 24時間まで待機
      });

      collector.on('collect', i => {
        if (i.customId === `stop_snooze_${reminderId}`) {
          clearTimeout(client.reminders.get(reminderId));
          client.reminders.delete(reminderId);
          i.update({ content: '⏹ スヌーズを停止しました', components: [] });
        }
      });

      // スヌーズ: 同じ間隔で繰り返す
      const timeout = setTimeout(function snoozeNotify() {
        interaction.channel.send({ content, components: [row] });
        client.reminders.set(reminderId, setTimeout(snoozeNotify, delayMs));
      }, delayMs);

      client.reminders.set(reminderId, timeout);
    }
  };

  // 最初の通知
  const initialTimeout = setTimeout(sendReminder, delayMs);
  client.reminders.set(reminderId, initialTimeout);

  await interaction.reply({ content: `⏰ リマインダーをセットしました（タイムゾーン: ${tz}, スヌーズ: ${snooze}）`, flags: 64 });
}
