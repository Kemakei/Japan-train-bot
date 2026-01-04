import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

// ===== ESM対応 __dirname =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== Excel読み込み =====
const excelPath = path.join(__dirname, "..", "utils", "words.xlsx");

function loadWords() {
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  rows.shift(); // ヘッダー削除
  return rows.filter(r => r[0] && r[1]);
}

function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

// ===== セッション管理用 Map =====
// userId → Set of used words
const usedWordsMap = new Map();

export const data = new SlashCommandBuilder()
  .setName("word")
  .setDescription("英単語クイズ");

export async function execute(interaction) {
  const userId = interaction.user.id;
  const client = interaction.client; // client取得
  const rows = loadWords();

  if (rows.length < 5) {
    await interaction.reply({
      content: "単語数が足りません、管理者に連絡してください",
      ephemeral: true,
    });
    return;
  }

  // ===== 出題済み単語を避ける =====
  const usedSet = usedWordsMap.get(userId) || new Set();
  const availableRows = rows.filter(r => !usedSet.has(r[0]));

  if (availableRows.length === 0) {
    usedSet.clear(); // 全部使い切ったらリセット
  }

  const questionRow = shuffle(availableRows).shift();
  const [word, correctMeaning] = questionRow;

  // 出題済み記録
  usedSet.add(word);
  usedWordsMap.set(userId, usedSet);

  // ===== 意味をユニーク化 =====
  const uniqueMeanings = Array.from(new Set(rows.map(r => r[1])));
  const wrongCandidates = uniqueMeanings.filter(m => m !== correctMeaning);
  const wrongMeanings = shuffle(wrongCandidates).slice(0, 4);
  const choices = shuffle([correctMeaning, ...wrongMeanings]);

  // ===== ボタン作成 =====
  const buttons = new ActionRowBuilder().addComponents(
    choices.map((c, i) =>
      new ButtonBuilder()
        .setCustomId(`word_${i}`) // index で管理
        .setLabel(c)
        .setStyle(ButtonStyle.Primary)
    )
  );

  // ===== 出題 =====
  await interaction.reply({
    content: `📘 **同じ意味となる英単語を選択してください**\n**${word}**`,
    components: [buttons],
    ephemeral: false,
  });

  const message = await interaction.fetchReply();

  // ===== ボタン収集 =====
  const collector = message.createMessageComponentCollector({
    time: 30_000,
  });

  collector.on("collect", async i => {
    if (i.user.id !== userId) {
      await i.reply({ content: "❌ あなたのクイズではありません", ephemeral: true });
      return;
    }

    const choiceIndex = Number(i.customId.split("_")[1]);
    const selected = choices[choiceIndex];

    if (selected === correctMeaning) {
      // 正解 + Coins +500
      await client.updateCoins(userId, 500);
      await i.update({ content: `**正解**\n解答：**${correctMeaning}**`, components: [] });
    } else {
      // 不正解 + Coins +150
      await client.updateCoins(userId, 150);
      await i.update({ content: `不正解\n解答：**${correctMeaning}**`, components: [] });
    }

    collector.stop();
  });

  collector.on("end", collected => {
    if (collected.size === 0) {
      interaction.editReply({
        content: `時間切れ\n解答：**${correctMeaning}**`,
        components: [],
      });
    }
  });
}
