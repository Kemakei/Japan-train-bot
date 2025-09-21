import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cooldownFile = path.join(__dirname, '../cooldowns.json');

// -------------------- cooldowns.json 読み書き --------------------
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

// -------------------- SlashCommandBuilder --------------------
export const data = new SlashCommandBuilder()
  .setName('work')
  .setDescription('20分に1回お金をもらえます');

export async function execute(interaction) {
  try {
    const userId = interaction.user.id;
    const now = Date.now();
    const cooldown = 20 * 60 * 1000; // 20分
    const lastUsed = cooldowns[userId] || 0;

    if (now - lastUsed < cooldown) {
      const remaining = cooldown - (now - lastUsed);
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);

      // ephemeral で通知
      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({
          content: `次に実行できるまであと **${minutes}分${seconds}秒** です。`,
          flags: 64
        });
      } else {
        await interaction.editReply({
          content: `次に実行できるまであと **${minutes}分${seconds}秒** です。`,
          flags: 64
        });
      }
      return;
    }

    // ランダム報酬 (600〜1000)
    const earned = Math.floor(Math.random() * (1000 - 600 + 1)) + 600;
    interaction.client.updateCoins(userId, earned);

    // cooldown 更新＆保存
    cooldowns[userId] = now;
    saveCooldowns(cooldowns);

    // Embed を作成（緑色）
    const embed = new EmbedBuilder()
      .setColor('Green')
      .setDescription(
        `💰 **${earned}コイン手に入れました！**\n所持金: **${interaction.client.getCoins(userId)}コイン**`
      );

    // 公開メッセージ
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ embeds: [embed] });
    } else {
      await interaction.editReply({ embeds: [embed] });
    }

  } catch (err) {
    console.error(err);
    // エラーは ephemeral
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: "❌ コマンド実行中にエラーが発生しました", flags: 64 });
    } else {
      await interaction.editReply({ content: "❌ コマンド実行中にエラーが発生しました", flags: 64 });
    }
  }
}
