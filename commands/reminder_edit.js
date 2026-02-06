import { SlashCommandBuilder } from "discord.js";
import { DateTime } from "luxon";

export const data = new SlashCommandBuilder()
  .setName("reminder_edit")
  .setDescription("リマインダーの確認・編集・削除")
  .addStringOption(o =>
    o.setName("target")
      .setDescription("編集対象のリマインダー")
      .setAutocomplete(true)
      .setRequired(false)
  )
  .addStringOption(o =>
    o.setName("time")
      .setDescription("新しい時間（分後 or MM/DD HH:mm）")
      .setRequired(false)
  )
  .addStringOption(o =>
    o.setName("message")
      .setDescription("新しいメッセージ")
      .setRequired(false)
  )
  .addBooleanOption(o =>
    o.setName("snooze")
      .setDescription("スヌーズ変更")
      .setRequired(false)
  )
  .addStringOption(o =>
    o.setName("timezone")
      .setDescription("UTC / +9 / -5")
      .setRequired(false)
  )
  .addBooleanOption(o =>
    o.setName("delete")
      .setDescription("削除する")
      .setRequired(false)
  );

// =====================
// Autocomplete
// =====================
export async function handleAutocomplete(interaction) {
  const remindersCol = interaction.client.db.collection("reminders");
  const userId = interaction.user.id;
  const focused = interaction.options.getFocused();

  const list = await remindersCol
    .find({ userId, active: true })
    .sort({ targetAt: 1 })
    .limit(25)
    .toArray();

  const choices = list.map(r => {
    const dt = DateTime.fromJSDate(r.targetAt).setZone(r.timezone);
    const label = r.isDatetime
      ? dt.toFormat("MM/dd HH:mm")
      : `${Math.ceil(r.delayMs / 60000)}分後`;

    return {
      name: `${label}｜${r.message?.slice(0, 30) || "メッセージなし"}`,
      value: String(r.reminderId)
    };
  });

  const filtered = focused
    ? choices.filter(c => c.name.includes(focused))
    : choices;

  await interaction.respond(filtered.slice(0, 25));
}

// =====================
// Execute
// =====================
export async function execute(interaction, { client }) {
  const remindersCol = client.db.collection("reminders");
  const userId = interaction.user.id;

  const target = interaction.options.getString("target");
  const del = interaction.options.getBoolean("delete");

  /* ---------- まずユーザーの過去リマインダーをチェックして削除 ---------- */
  const userReminders = await remindersCol.find({ userId, active: true }).toArray();
  for (const r of userReminders) {
    if (r.targetAt && r.targetAt <= new Date()) {
      await remindersCol.deleteOne({ reminderId: r.reminderId });
      const t = client.reminders.get(r.reminderId);
      if (t) clearTimeout(t);
      client.reminders.delete(r.reminderId);
    }
  }

  /* ---------- 一覧表示 ---------- */
  if (!target) {
    const list = await remindersCol
      .find({ userId, active: true })
      .sort({ targetAt: 1 })
      .toArray();

    if (!list.length) {
      return interaction.reply({ content: "有効なリマインダーはありません", flags: 64 });
    }

    const lines = list.map(r => {
      const dt = DateTime.fromJSDate(r.targetAt).setZone(r.timezone);
      return `• ${dt.toFormat("MM/dd HH:mm")} (${r.timezone}) snooze=${r.snooze}｜${r.message || "メッセージなし"}`;
    });

    return interaction.reply({ content: lines.join("\n"), flags: 64 });
  }

  /* ---------- 対象取得 ---------- */
  const reminderId = Number(target);

  const found = await remindersCol.findOne({
    reminderId,
    userId,
    active: true
  });

  if (!found) {
    return interaction.reply({ content: "該当リマインダーが見つかりません", flags: 64 });
  }

  /* ---------- 削除 ---------- */
  if (del) {
    const t = client.reminders.get(found.reminderId);
    if (t) clearTimeout(t);

    await remindersCol.updateOne(
      { reminderId: found.reminderId },
      { $set: { active: false, updatedAt: new Date() } }
    );

    client.reminders.delete(found.reminderId);
    return interaction.reply({ content: "削除しました", flags: 64 });
  }

  /* ---------- 編集 ---------- */
  const update = {};
  let newDelayMs = null;

  /* メッセージ */
  const newMessage = interaction.options.getString("message");
  if (newMessage !== null) {
    update.message = newMessage;
  }

  /* タイムゾーン */
  const tzInput = interaction.options.getString("timezone");
  if (tzInput) {
    if (/^[+-]?\d+$/.test(tzInput)) {
      update.timezone = `UTC${tzInput.startsWith("+") || tzInput.startsWith("-") ? tzInput : "+" + tzInput}`;
    } else {
      update.timezone = tzInput.toUpperCase();
    }
  }
  const timezone = update.timezone || found.timezone;

  /* 時間 */
  const timeInput = interaction.options.getString("time");
  if (timeInput) {
    if (/^\d+$/.test(timeInput)) {
      newDelayMs = Number(timeInput) * 60 * 1000;
      update.isDatetime = false;
    } else {
      const m = timeInput.match(/^(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})$/);
      if (!m) {
        return interaction.reply({ content: "時間形式が不正です", flags: 64 });
      }

      const now = DateTime.now().setZone(timezone);
      let dt = DateTime.fromObject({
        year: now.year,
        month: Number(m[1]),
        day: Number(m[2]),
        hour: Number(m[3]),
        minute: Number(m[4])
      }, { zone: timezone });

      if (dt <= now) dt = dt.plus({ years: 1 });

      newDelayMs = dt.toMillis() - Date.now();
      update.targetAt = dt.toJSDate();
      update.isDatetime = true;
    }
  }

  /* スヌーズ */
  const snoozeOpt = interaction.options.getBoolean("snooze");
  if (snoozeOpt !== null) {
    update.snooze = snoozeOpt;
  }

  /* 再スケジュール */
  if (newDelayMs !== null) {
    const old = client.reminders.get(found.reminderId);
    if (old) clearTimeout(old);

    const timeout = setTimeout(async () => {
      const ch = await client.channels.fetch(found.channelId);
      await ch.send(`<@${userId}> ${update.message ?? found.message ?? "リマインドです"}`);

      // 実行後は削除
      await remindersCol.deleteOne({ reminderId: found.reminderId });
      client.reminders.delete(found.reminderId);
    }, newDelayMs);

    client.reminders.set(found.reminderId, timeout);

    update.delayMs = newDelayMs;
    update.targetAt = new Date(Date.now() + newDelayMs);
  }

  update.updatedAt = new Date();
  await remindersCol.updateOne(
    { reminderId: found.reminderId },
    { $set: update }
  );

  /* ---------- 編集後に現在時刻を過ぎていたら削除 ---------- */
  const checkTargetAt = update.targetAt || found.targetAt;
  if (checkTargetAt && checkTargetAt <= new Date()) {
    await remindersCol.deleteOne({ reminderId: found.reminderId });
    const t = client.reminders.get(found.reminderId);
    if (t) clearTimeout(t);
    client.reminders.delete(found.reminderId);

    return interaction.reply({ content: "編集後、リマインダーの時間が過ぎていたため削除しました", flags: 64 });
  }

  await interaction.reply({ content: "更新しました", flags: 64 });
}
