import { SlashCommandBuilder } from "discord.js";
import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

// ===== ESM対応 __dirname =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== Excel読み込み =====
const excelPath = path.join(__dirname, "..", "utils", "駅名標.xlsx");

function loadRows() {
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // ヘッダーを削除
  rows.shift();

  // A列・B列が両方空欄の行は除外
  return rows.filter(row => {
    const a = String(row[0] ?? "").trim();
    const b = String(row[1] ?? "").trim();
    return a !== "" || b !== "";
  });
}

export const data = new SlashCommandBuilder()
  .setName("random_hokkaido")
  .setDescription("北海道の駅を自動的に選出します");

export async function execute(interaction) {
  const rows = loadRows();

  if (rows.length === 0) {
    await interaction.reply({
      content: "表示できるデータがありません。",
      ephemeral: true,
    });
    return;
  }

  // ランダムに1行取得
  const randomRow = rows[Math.floor(Math.random() * rows.length)];

  const a = String(randomRow[0] ?? "").trim();
  const b = String(randomRow[1] ?? "").trim();

  // A列とB列を結合
  const output = [a, b].filter(v => v !== "").join(" ");

  await interaction.reply({
    content: output,
  });
}

