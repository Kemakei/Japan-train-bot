import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const licensesFile = path.join(__dirname, '../licenses.json');

const licenseList = [
  { name: '教員免許状', time: 30 * 60 * 1000, cost: 1000 },
  { name: '技能証明', time: 1 * 60 * 60 * 1000, cost: 10000 },
  { name: '航空身体検査証明', time: 2 * 60 * 60 * 1000, cost: 30000 },
  { name: 'ITパスポート', time: 3 * 60 * 60 * 1000, cost: 40000 },
  { name: '医師免許', time: 6 * 60 * 60 * 1000, cost: 100000 },
];

function loadJSON(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({}));
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let userLicenses = loadJSON(licensesFile);

export const data = new SlashCommandBuilder()
  .setName('license')
  .setDescription('ライセンスを取得または確認')
  .addStringOption(option =>
    option.setName('取得')
      .setDescription('取得したいライセンス')
      .setRequired(false)
      .addChoices(...licenseList.map(l => ({ name: l.name, value: l.name })))
  );

export async function execute(interaction) {
  try {
    const userId = interaction.user.id;
    const target = interaction.options.getString('取得');

    if (!userLicenses[userId]) userLicenses[userId] = { obtained: [], pending: null };
    const userData = userLicenses[userId];

    // 取得確認（targetなし）の場合
    if (!target) {
      const now = Date.now();

      if (userData.pending) {
        if (now >= userData.pending.finish) {
          // pending完了 → 成功/失敗判定
          const finishedLicense = userData.pending.name;
          let message;

          if (Math.random() < 0.05) {
            // 5%で失敗
            message = `❌ ${finishedLicense} の取得に失敗しました。`;
          } else {
            // 成功
            userData.obtained.push(finishedLicense);
            message = `✅ ${finishedLicense} を取得しました！`;
          }

          userData.pending = null;
          saveJSON(licensesFile, userLicenses);

          const embed = new EmbedBuilder()
            .setColor('Blue')
            .setDescription(`✅ 取得済みライセンス: ${userData.obtained.join(', ') || 'なし'}\n${message}`);
          return await interaction.reply({ embeds: [embed] });
        } else {
          // まだ取得中
          const embed = new EmbedBuilder()
            .setColor('Blue')
            .setDescription(`✅ 取得済みライセンス: ${userData.obtained.join(', ') || 'なし'}\n⏳ 取得申請中: ${userData.pending.name}`);
          return await interaction.reply({ embeds: [embed] });
        }
      } else {
        // pendingなし
        const embed = new EmbedBuilder()
          .setColor('Blue')
          .setDescription(`✅ 取得済みライセンス: ${userData.obtained.join(', ') || 'なし'}\n⏳ 取得申請中: なし`);
        return await interaction.reply({ embeds: [embed] });
      }
    }

    // ライセンス取得申請処理
    if (userData.pending) {
      return await interaction.reply({ content: `❌ 既にライセンス取得申請中: ${userData.pending.name}`, flags: 64 });
    }

    const license = licenseList.find(l => l.name === target);
    if (!license) return await interaction.reply({ content: '❌ そのライセンスは存在しません', flags: 64 });
    if (userData.obtained.includes(target)) return await interaction.reply({ content: `✅ 既に取得済みです: ${target}`, flags: 64 });

    const coins = await interaction.client.getCoins(userId);
    if (coins < license.cost) return await interaction.reply({ content: `❌ コインが足りません: ${license.cost}`, flags: 64 });

    // コインを消費して申請開始
    await interaction.client.updateCoins(userId, -license.cost);
    const finishTime = Date.now() + license.time;
    userData.pending = { name: license.name, finish: finishTime };
    saveJSON(licensesFile, userLicenses);

    await interaction.reply({ content: `⏳ ${license.name} 取得申請開始。完了予定: ${new Date(finishTime).toLocaleString()}` });

  } catch (err) {
    console.error(err);
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: "❌ エラーが発生しました", flags: 64 });
  }
}
