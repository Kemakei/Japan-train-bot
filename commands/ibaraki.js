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

  return rows
    .slice(1411, 1542) //excelデータをスライス
    .filter(row => {
      const a = String(row[0] ?? "").trim();
      const b = String(row[1] ?? "").trim();

      // A列またはB列が空欄なら除外
      return a !== "" && b !== "";
    });
}

export const data = new SlashCommandBuilder()
  .setName("ibaraki")
  .setDescription("茨城県の駅を自動的に選出します");

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

  await interaction.reply({
    content: `${a} ${b}`,
  });
}