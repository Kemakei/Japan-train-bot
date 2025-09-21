import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cooldownFile = path.join(__dirname, '../cooldowns.json');

function loadCooldowns() {
  try {
    if (!fs.existsSync(cooldownFile)) fs.writeFileSync(cooldownFile, JSON.stringify({}));
    return JSON.parse(fs.readFileSync(cooldownFile, 'utf-8'));
  } catch (err) {
    console.error("cooldowns.json 読み込み失敗:", err);
    return {};
  }
}

function saveCooldowns(data) {
  try {
    fs.writeFileSync(cooldownFile, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("cooldowns.json 保存失敗:", err);
  }
}

let cooldowns = loadCooldowns();

export const data = new SlashCommandBuilder()
  .setName('work')
  .setDescription('20分に1回お金をもらえます');

export async function execute(interaction) {
  try {
    // まず ACK
    await interaction.deferReply();

    const userId = interaction.user.id;
    const now = Date.now();
    const cooldown = 20 * 60 * 1000; // 20分
    const lastUsed = cooldowns[userId] || 0;

    if (now - lastUsed < cooldown) {
      const remaining = cooldown - (now - lastUsed);
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);

     return await interaction.editReply({
     content: `次に実行できるまであと **${minutes}分${seconds}秒** です。`,
     flags: 64
     });
    }

    const earned = Math.floor(Math.random() * (1000 - 600 + 1)) + 600;
    interaction.client.updateCoins(userId, earned);

    cooldowns[userId] = now;
    saveCooldowns(cooldowns);

    const embed = new EmbedBuilder()
      .setColor('Green')
      .setDescription(
        `💰 **${earned}コイン手に入れました！**\n所持金: **${interaction.client.getCoins(userId)}コイン**`
      );

    // エフェメラルはエラー時のみ
    await interaction.editReply({ embeds: [embed], ephemeral: false });

  } catch (err) {
    console.error(err);
    try {
      if (!interaction.replied) {
        await interaction.reply({ content: "❌ コマンド実行中にエラーが発生しました", ephemeral: true });
      } else {
        await interaction.editReply({ content: "❌ コマンド実行中にエラーが発生しました", ephemeral: true });
      }
    } catch {}
  }
}
