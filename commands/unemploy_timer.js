import { SlashCommandBuilder } from "discord.js";
import { request } from "undici";

/* ---------------- 共通 ---------------- */

function resolveUserId(input, fallbackUserId) {
  if (!input) return fallbackUserId;

  const mention = input.match(/^<@!?(\d+)>$/);
  if (mention) return mention[1];

  if (/^\d+$/.test(input)) return input;

  return fallbackUserId;
}

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

  let history;
  try {
    history = JSON.parse(await res.body.text());
  } catch {
    throw new Error("takasumi bot側でエラーが発生しました");
  }

  if (!Array.isArray(history)) return null;

  const latest = history
    .filter(h => h.action === "失業保険を購入")
    .sort((a, b) => new Date(b.time) - new Date(a.time))[0];

  if (!latest) return null;

  return new Date(
    new Date(latest.time).getTime() + 7 * 24 * 60 * 60 * 1000
  );
}

/* ---------------- Command ---------------- */

export const data = new SlashCommandBuilder()
  .setName("unemploy_timer")
  .setDescription("takasumi botの失業保険期限を設定します")
  .addStringOption(opt =>
    opt
      .setName("user")
      .setDescription("対象ユーザー（ID または メンション）")
      .setRequired(false)
  );

export async function execute(interaction, { client }) {
  await interaction.deferReply({ ephemeral: true });

  const input = interaction.options.getString("user");
  const userId = resolveUserId(input, interaction.user.id);

  const expireDate = await fetchUnemployExpireDate(userId);
  if (!expireDate) {
    throw new Error("失業保険の購入履歴が見つかりません");
  }

  await client.db.collection("unemploy_timers").updateOne(
    { guildId: interaction.guildId, userId },
    {
      $set: {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId,
        expireAt: expireDate.getTime(),
        notified: false
      }
    },
    { upsert: true }
  );

  await interaction.editReply(
    `リマインダーを設定しました`
  );
}
