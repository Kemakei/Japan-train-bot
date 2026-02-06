import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} from "discord.js";
import { DateTime } from "luxon";

export const data = new SlashCommandBuilder()
  .setName("reminder")
  .setDescription("指定時間後または日時にリマインドします")
  .addStringOption(option =>
    option
      .setName("time")
      .setDescription("分後（例: 5）または MM/DD HH:mm（例: 12/31 14:30）")
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName("message")
      .setDescription("リマインドメッセージ")
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName("timezone")
      .setDescription("UTC, +9, -8（未指定でUTC）")
      .setRequired(false)
  )
  .addBooleanOption(option =>
    option
      .setName("snooze")
      .setDescription("スヌーズを有効にするか")
      .setRequired(false)
  );

export async function execute(interaction, { client }) {
  const remindersCol = client.db.collection("reminders");

  const timeInput = interaction.options.getString("time");
  const messageText = interaction.options.getString("message") || "";
  const tzInput = interaction.options.getString("timezone") || "UTC";
  const snoozeRequested = interaction.options.getBoolean("snooze") || false;

  const userId = interaction.user.id;
  const channelId = interaction.channel.id;
  const guildId = interaction.guildId;
  const userMention = `<@${userId}>`;

  const reminderId = Date.now();

  if (!client.reminders) client.reminders = new Map();

  /* =====================
     スヌーズ停止許可ユーザー
     ===================== */
  const allowedUserIds = new Set([userId]);
  const mentionMatches = messageText.match(/<@!?(\d+)>/g);
  if (mentionMatches) {
    for (const m of mentionMatches) {
      allowedUserIds.add(m.match(/\d+/)[0]);
    }
  }

  /* =====================
     タイムゾーン処理
     ===================== */
  let timezone = "UTC";
  if (/^[+-]?\d+$/.test(tzInput)) {
    timezone = `UTC${tzInput.startsWith("+") || tzInput.startsWith("-") ? tzInput : "+" + tzInput}`;
  } else {
    timezone = tzInput.toUpperCase();
  }

  let delayMs;
  let isDatetime = false;
  let targetAt;

  /* =====================
     時間解析
     ===================== */
  if (/^\d+$/.test(timeInput)) {
    delayMs = Number(timeInput) * 60 * 1000;
    targetAt = new Date(Date.now() + delayMs);
  } else {
    const match = timeInput.match(/^(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})$/);
    if (!match) {
      return interaction.reply({
        content: "時間形式が無効です（分後 または MM/DD HH:mm）",
        flags: 64
      });
    }

    isDatetime = true;

    const [, month, day, hour, minute] = match.map(Number);
    const now = DateTime.now().setZone(timezone);

    let dt = DateTime.fromObject(
      { year: now.year, month, day, hour, minute },
      { zone: timezone }
    );

    if (dt <= now) dt = dt.plus({ years: 1 });

    delayMs = dt.toMillis() - Date.now();
    targetAt = dt.toJSDate();
  }

  /* =====================
     スヌーズ制御
     ===================== */
  const snooze = isDatetime ? false : snoozeRequested;

  /* =====================
     リマインダー送信処理
     ===================== */
  let lastMessage = null;

  const sendReminder = async () => {
    const content = messageText
      ? `${userMention} ${messageText}`
      : `${userMention} `;

    if (lastMessage) {
      try {
        await lastMessage.edit({ components: [] });
      } catch {}
    }

    const row = snooze
      ? new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`stop_snooze_${reminderId}`)
            .setLabel("スヌーズをストップ")
            .setStyle(ButtonStyle.Danger)
        )
      : null;

    const msg = await interaction.channel.send({
      content,
      components: snooze ? [row] : []
    });

    lastMessage = msg;

    /* ----- スヌーズ停止 ----- */
    if (snooze) {
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 7 * 24 * 60 * 60 * 1000
      });

      collector.on("collect", async i => {
        if (i.customId !== `stop_snooze_${reminderId}`) return;

        if (!allowedUserIds.has(i.user.id)) {
          return i.reply({
            content: "このスヌーズを停止する権限がありません",
            flags: 64
          });
        }

        await i.deferUpdate();

        const active = client.reminders.get(reminderId);
        if (active) clearTimeout(active);
        client.reminders.delete(reminderId);

        // MongoDB から削除
        await remindersCol.deleteOne({ reminderId });

        await msg.edit({
          content: "スヌーズを停止しました",
          components: []
        });

        collector.stop();
      });
    }

    /* ----- 実行後スケジュール（スヌーズなしは終了） ----- */
    if (!isDatetime && snooze && client.reminders.has(reminderId)) {
      const t = setTimeout(sendReminder, delayMs);
      client.reminders.set(reminderId, t);
    } else {
      client.reminders.delete(reminderId);
      // MongoDB から削除
      await remindersCol.deleteOne({ reminderId });
    }
  };

  /* =====================
     初回セット
     ===================== */
  const timeout = setTimeout(sendReminder, delayMs);
  client.reminders.set(reminderId, timeout);

  /* =====================
     MongoDB 保存
     ===================== */
  await remindersCol.insertOne({
    reminderId,
    userId,
    channelId,
    guildId,
    message: messageText,
    mentionUserIds: [...allowedUserIds],
    isDatetime,
    delayMs,
    targetAt,
    timezone,
    snooze,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  await interaction.reply({
    content: `リマインダーをセットしました（${timezone}, スヌーズ:${snooze}）`,
    flags: 64
  });
}
