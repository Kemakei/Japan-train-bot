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
  try {
    // defer（ephemeral）応答
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const userId = interaction.user.id;
    const now = Date.now();
    const cooldown = 20 * 60 * 1000; // 20分
    const lastUsed = cooldowns[userId] || 0;

    if (now - lastUsed < cooldown) {
      const remaining = cooldown - (now - lastUsed);
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      return await interaction.editReply({content:
        `次に実行できるまであと **${minutes}分${seconds}秒** です。`, flags: 64
    });
    }

    // ランダム報酬 (600〜1000)
    const earned = Math.floor(Math.random() * (1000 - 600 + 1)) + 600;

    // coins.json は updateCoins でのみ更新
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

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error(err);
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: "❌ コマンド実行中にエラーが発生しました", flags: 64 });
    } else {
      await interaction.editReply("❌ コマンド実行中にエラーが発生しました");
    }
  }
}
