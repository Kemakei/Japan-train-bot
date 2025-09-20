import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cooldownFile = path.join(__dirname, '../cooldowns.json');

function loadCooldowns() {
  if (!fs.existsSync(cooldownFile)) fs.writeFileSync(cooldownFile, JSON.stringify({}));
  return JSON.parse(fs.readFileSync(cooldownFile, 'utf-8'));
}

function saveCooldowns(data) {
  fs.writeFileSync(cooldownFile, JSON.stringify(data, null, 2));
}

let cooldowns = loadCooldowns();

export const data = new SlashCommandBuilder()
  .setName('work')
  .setDescription('20分に1回お金をもらえます');

export async function execute(interaction) {
  const userId = interaction.user.id;
  const now = Date.now();

  const cooldown = 20 * 60 * 1000; // 20分
  const lastUsed = cooldowns[userId] || 0;

  if (now - lastUsed < cooldown) {
    const remaining = cooldown - (now - lastUsed);
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    return interaction.reply({
      content: `次に実行できるまであと **${minutes}分${seconds}秒** です。`,
      ephemeral: true
    });
  }

  // ランダム報酬 (600〜1000)
  const earned = Math.floor(Math.random() * (1000 - 600 + 1)) + 600;

  // コインを更新
  interaction.client.updateCoins(userId, earned);

  // クールダウン更新＆保存
  cooldowns[userId] = now;
  saveCooldowns(cooldowns);

  // Embedを作成（緑色）
  const embed = new EmbedBuilder()
    .setColor('Green') // 緑色
    .setDescription(`💰 **${earned}コイン手に入れました！**\n所持金: **${interaction.client.getCoins(userId)}コイン**`);

  return interaction.reply({ embeds: [embed] });
}
