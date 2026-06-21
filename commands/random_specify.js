import { SlashCommandBuilder } from "discord.js";
import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

// ===== ESM対応 =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const excelPath = path.join(__dirname, "..", "utils", "駅名標.xlsx");

function loadRows() {
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  rows.shift();

  return rows.filter(row => {
    const a = String(row[0] ?? "").trim();
    const b = String(row[1] ?? "").trim();
    return a !== "" || b !== "";
  });
}

// 括弧を削除
function normalize(str) {
  return String(str)
    .replace(/（.*?）/g, "")
    .replace(/\(.*?\)/g, "")
    .trim();
}

export const data = new SlashCommandBuilder()
  .setName("random_specify")
  .setDescription("指定した文字列が入っている路線からランダムに駅を選びます。（現在北海道のみ実装済み）")
  .addStringOption(option =>
    option
      .setName("line")
      .setDescription("検索する路線名")
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName("save")
      .setDescription("路線名を保存")
      .setRequired(false)
  );

export async function execute(interaction) {
  const db = interaction.client.db;

  const lineInput = interaction.options.getString("line");
  const saveInput = interaction.options.getString("save");

  const collection = db.collection("saved_lines");

  // save が入力されていたら保存
  if (saveInput) {
    const rows = loadRows();

    const matched = rows.filter(row => {
      const b = normalize(row[1] ?? "");
      return b.includes(normalize(saveInput));
    });

    if (matched.length === 0) {
      await interaction.reply({
        content:
          "見つかりませんでした。形式が違っている可能性があります。",
        ephemeral: true,
      });
      return;
    }

    await collection.updateOne(
      { userId: interaction.user.id },
      {
        $set: {
          line: saveInput,
        },
      },
      { upsert: true }
    );
  }

  let targetLine = lineInput;

  if (!targetLine) {
    const saved = await collection.findOne({
      userId: interaction.user.id,
    });

    if (!saved?.line) {
      await interaction.reply({
        content: "まだ路線名を登録していません。",
        ephemeral: true,
      });
      return;
    }

    targetLine = saved.line;
  }

  const rows = loadRows();

  const candidates = rows.filter(row => {
    const b = normalize(row[1] ?? "");
    return b.includes(normalize(targetLine));
  });

  if (candidates.length === 0) {
    await interaction.reply({
      content:
        "見つかりませんでした。形式が違っている可能性があります（例）南北線：札幌地下鉄南北線",
      ephemeral: true,
    });
    return;
  }

  const station =
    candidates[Math.floor(Math.random() * candidates.length)];

  const a = String(station[0] ?? "").trim();
  const b = String(station[1] ?? "").trim();

  await interaction.reply({
    content: `${a} ${b}`,
  });
}