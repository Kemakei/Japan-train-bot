import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const licenseList = [
  { name: '教員免許状', time: 30 * 60 * 1000, cost: 1000 },
  { name: '技能証明', time: 1 * 60 * 60 * 1000, cost: 10000 },
  { name: '航空身体検査証明', time: 2 * 60 * 60 * 1000, cost: 30000 },
  { name: 'ITパスポート', time: 3 * 60 * 60 * 1000, cost: 40000 },
  { name: '医師免許', time: 6 * 60 * 60 * 1000, cost: 100000 },
];

// 残り時間整形（時間・分・秒）
function formatRemaining(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) {
    return `${hours}時間${minutes}分${seconds}秒`;
  }
  if (minutes > 0) {
    return `${minutes}分${seconds}秒`;
  }
  return `${seconds}秒`;
}

export const data = new SlashCommandBuilder()
  .setName('license')
  .setDescription('ライセンスを取得または確認')
  .addStringOption(option =>
    option
      .setName('取得')
      .setDescription('取得したいライセンス')
      .setRequired(false)
      .addChoices(...licenseList.map(l => ({ name: l.name, value: l.name })))
  );

export async function execute(interaction) {
  const userId = interaction.user.id;
  const col = interaction.client.db.collection('licenses');

  try {
    // ==============================
    // ユーザーデータ取得 or 初期化
    // ==============================
    let userData = await col.findOne({ userId });
    if (!userData) {
      userData = {
        userId,
        obtained: [],
        pending: null
      };
      await col.insertOne(userData);
    }

    const target = interaction.options.getString('取得');
    const now = Date.now();

    // ==============================
    // 取得状況の確認（引数なし）
    // ==============================
    if (!target) {

      // ---- 完了チェック ----
      if (userData.pending && now >= userData.pending.finish) {
        const licenseName = userData.pending.name;
        let resultMessage;

        // 5%失敗
        if (Math.random() < 0.05) {
          resultMessage = `❌ ${licenseName} の取得に失敗しました。`;
        } else {
          resultMessage = `✅ ${licenseName} を取得しました！`;
          await col.updateOne(
            { userId },
            { $addToSet: { obtained: licenseName } }
          );
        }

        await col.updateOne(
          { userId },
          { $set: { pending: null } }
        );

        const updated = await col.findOne({ userId });

        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('Blue')
              .setDescription(
                `✅ 取得済みライセンス: ${updated.obtained.join(', ') || 'なし'}\n` +
                resultMessage
              )
          ]
        });
      }

      // ---- 取得中表示（残り時間） ----
      if (userData.pending) {
        const remaining = userData.pending.finish - now;

        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('Blue')
              .setDescription(
                `✅ 取得済みライセンス: ${userData.obtained.join(', ') || 'なし'}\n` +
                `⏳ 取得申請中: ${userData.pending.name}\n` +
                `⏱ 残り時間: ${formatRemaining(remaining)}`
              )
          ]
        });
      }

      // ---- pendingなし ----
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Blue')
            .setDescription(
              `✅ 取得済みライセンス: ${userData.obtained.join(', ') || 'なし'}\n` +
              `⏳ 取得申請中: なし`
            )
        ]
      });
    }

    // ==============================
    // ライセンス取得申請
    // ==============================
    if (userData.pending) {
      return interaction.reply({
        content: `❌ 既にライセンス取得申請中: ${userData.pending.name}`,
        flags: 64
      });
    }

    const license = licenseList.find(l => l.name === target);
    if (!license) {
      return interaction.reply({ content: '❌ そのライセンスは存在しません', flags: 64 });
    }

    if (userData.obtained.includes(target)) {
      return interaction.reply({ content: `✅ 既に取得済みです: ${target}`, flags: 64 });
    }

    const coins = await interaction.client.getCoins(userId);
    if (coins < license.cost) {
      return interaction.reply({
        content: `❌ コインが足りません（必要: ${license.cost}）`,
        flags: 64
      });
    }

    // ---- コイン消費 & 申請開始 ----
    await interaction.client.updateCoins(userId, -license.cost);

    const finishTime = now + license.time;
    await col.updateOne(
      { userId },
      {
        $set: {
          pending: {
            name: license.name,
            finish: finishTime
          }
        }
      }
    );

    await interaction.reply({
      content:
        `⏳ ${license.name} の取得申請を開始しました。\n` +
        `⏱ 残り時間: ${formatRemaining(license.time)}`
    });

  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      await interaction.reply({ content: '❌ エラーが発生しました', flags: 64 });
    }
  }
}
