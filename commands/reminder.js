import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
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
      .setRequired(false));

export async function execute(interaction, { client }) {
  const timeInput = interaction.options.getString('time');
  const messageText = interaction.options.getString('message') || '';
  const tzInput = interaction.options.getString('timezone') || 'UTC';
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

  const notify = async () => {
    const content = messageText
      ? `${userMention} リマインド: ${messageText}`
      : `${userMention} リマインド時間になりました！`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`stop_snooze_${reminderId}`)
        .setLabel('スヌーズをストップ')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.channel.send({ content, components: [row] });
  };

  client.reminders.set(reminderId, setTimeout(notify, delayMs));
  await interaction.reply({ content: `⏰ リマインダーをセットしました（タイムゾーン: ${tz}）`, flags: 64 });
}
