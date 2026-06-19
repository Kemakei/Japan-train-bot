import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { request } from "undici";

export const data = new SlashCommandBuilder()
.setName("takasumi_company_money")
.setDescription("[takasumi bot用]会社の収益分析")
.addStringOption(option =>
option
.setName("companyid")
.setDescription("会社ID")
.setRequired(true)
)
.addUserOption(option =>
option
.setName("user")
.setDescription("特定ユーザーのみ表示")
.setRequired(false)
);

function formatDate(date) {
return new Date(date).toLocaleString("ja-JP", {
timeZone: "Asia/Tokyo"
});
}

export async function execute(interaction) {
await interaction.deferReply();

const companyId = interaction.options.getString("companyid");
const targetUser = interaction.options.getUser("user");

try {
async function fetchCompanyData(companyId) {
  let res;

  try {
    res = await request(
      `https://api.takasumibot.com/v3/company/history/${companyId}`
    );
  } catch {
    throw new Error("API取得に失敗しました");
  }

  if (res.statusCode !== 200) {
    throw new Error("APIエラーが発生しました");
  }

  let data;

  try {
    data = JSON.parse(await res.body.text());
  } catch {
    throw new Error("JSON解析に失敗しました");
  }

  return Array.isArray(data) ? data : [];
};

if (!response.ok) {
  return interaction.editReply("❌ データ取得に失敗しました");
}

const data = await response.json();

const rewards = data
  .filter(
    r =>
      r.companyId === companyId &&
      typeof r.reason === "string" &&
      r.reason.startsWith("仕事の報酬")
  )
  .slice(-50);

if (!rewards.length) {
  return interaction.editReply(
    "❌ この会社の収益データが見つかりません"
  );
}

const startDate = new Date(rewards[0].tradedAt);
const endDate = new Date(rewards[rewards.length - 1].tradedAt);

const days =
  Math.max(
    1,
    (endDate - startDate) /
      (1000 * 60 * 60 * 24)
  );

const users = new Map();

for (const record of rewards) {
  const uid = record.userId;

  if (!users.has(uid)) {
    users.set(uid, {
      userId: uid,
      totalIncome: 0,
      workCount: 0,
      lastWorkDate: null
    });
  }

  const user = users.get(uid);

  user.totalIncome += record.amount;
  user.workCount++;

  const workDate = new Date(record.tradedAt);

  if (
    !user.lastWorkDate ||
    workDate > user.lastWorkDate
  ) {
    user.lastWorkDate = workDate;
  }
}

for (const user of users.values()) {
  user.dailyAverage = Math.round(
    user.totalIncome / days
  );

  try {
    const discordUser =
      await interaction.client.users.fetch(
        user.userId
      );

    user.username =
      discordUser.globalName ||
      discordUser.username;
  } catch {
    user.username = user.userId;
  }
}

// 個人表示
if (targetUser) {
  const userData = users.get(targetUser.id);

  if (!userData) {
    return interaction.editReply(
      "このユーザーの収益データは見つかりません"
    );
  }

  const embed = new EmbedBuilder()
    .setTitle("会社分析")
    .addFields(
      {
        name: "ユーザー",
        value: userData.username,
        inline: true
      },
      {
        name: "会社ID",
        value: companyId,
        inline: true
      },
      {
        name: "労働回数",
        value: String(userData.workCount),
        inline: true
      },
      {
        name: "総収益",
        value: userData.totalIncome.toLocaleString(),
        inline: true
      },
      {
        name: "平均収益/日",
        value:
          userData.dailyAverage.toLocaleString(),
        inline: true
      },
      {
        name: "最後に働いた日",
        value: formatDate(
          userData.lastWorkDate
        ),
        inline: true
      },
      {
        name: "集計期間",
        value:
          `${formatDate(startDate)}\n～\n${formatDate(endDate)}`
      }
    )
    .setColor(0x00AEFF)
    .setTimestamp();

  return interaction.editReply({
    embeds: [embed]
  });
}

// ランキング
const ranking = [...users.values()]
  .sort(
    (a, b) =>
      b.totalIncome - a.totalIncome
  )
  .slice(0, 10);

const medals = [
  "1",
  "2",
  "3",
  "4️",
  "5️",
  "6️",
  "7️",
  "8️",
  "9️",
  "10"
];

const description = ranking
  .map(
    (user, index) =>
      `${medals[index]} **${user.username}**\n` +
      `総収益: ${user.totalIncome.toLocaleString()}\n` +
      `平均収益/日: ${user.dailyAverage.toLocaleString()}\n` +
      `最後に働いた日: ${formatDate(user.lastWorkDate)}`
  )
  .join("\n\n");

const embed = new EmbedBuilder()
  .setTitle("会社分析")
  .setDescription(description)
  .addFields(
    {
      name: "会社ID",
      value: companyId,
      inline: true
    },
    {
      name: "対象データ",
      value: "直近50件の仕事報酬",
      inline: true
    },
    {
      name: "集計期間",
      value:
        `${formatDate(startDate)}\n～\n${formatDate(endDate)}`
    }
  )
  .setColor(0x2ECC71)
  .setTimestamp();

await interaction.editReply({
  embeds: [embed]
});

} catch (err) {
console.error(err);

await interaction.editReply(
  "❌ 会社分析中にエラーが発生しました"
);
}}