import {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
} from "discord.js";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const data = new SlashCommandBuilder()
  .setName("graph")
  .setDescription("株価折れ線グラフ表示");

export async function execute(interaction, { client }) {
  await interaction.deferReply();

  const pythonPath = path.resolve(__dirname, "../python/graph.py");
  const pythonCmd = process.platform === "win32" ? "py" : "python3";

  // MongoDB 取得（並列）
  const [tradeHistoryDoc, stockPriceDoc] = await Promise.all([
    client.coinsCol.findOne({ userId: "trade_history" }),
    client.coinsCol.findOne({ userId: "stock_price" }),
  ]);

  const tradeHistory = Array.isArray(tradeHistoryDoc?.coins)
    ? tradeHistoryDoc.coins
    : [];

  const stockPrice =
    typeof stockPriceDoc?.coins === "number"
      ? stockPriceDoc.coins
      : 950;

  // ===== 前回比計算（ここが追加部分） =====
  const currentPrice = tradeHistory.at(-1)?.price ?? stockPrice;
  const prevPrice = tradeHistory.at(-2)?.price ?? null;

  const diff =
    typeof prevPrice === "number"
      ? currentPrice - prevPrice
      : null;

  const percent =
    typeof diff === "number" && prevPrice > 0
      ? (diff / prevPrice) * 100
      : null;

  let diffText = "データなし";
  if (typeof diff === "number") {
    const sign = diff > 0 ? "+" : "";
    const percentText =
      typeof percent === "number"
        ? ` (${sign}${percent.toFixed(1)}%)`
        : "";
    diffText = `${sign}${diff.toLocaleString()} コイン${percentText}`;
  }
  // =====================================

  // Python に送るデータ
  const dataToSend = JSON.stringify({
    trade_history: tradeHistory,
    stock_price: stockPrice,
  });

  const py = spawn(pythonCmd, [pythonPath]);

  py.stdin.write(dataToSend);
  py.stdin.end();

  let output = "";
  let errorOutput = "";

  py.stdout.on("data", (data) => {
    output += data.toString();
  });

  py.stderr.on("data", (data) => {
    errorOutput += data.toString();
  });

  py.on("close", async (code) => {
    if (code !== 0) {
      console.error("❌ Pythonエラー:", errorOutput);
      return interaction.editReply({
        content: "❌ グラフ生成失敗",
        flags: 64,
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch (e) {
      console.error("❌ JSON解析失敗:", e, output);
      return interaction.editReply({
        content: "❌ グラフ情報の解析に失敗しました",
        flags: 64,
      });
    }

    const imagePath = parsed.image || "stock.png";
    if (!fs.existsSync(imagePath)) {
      return interaction.editReply({
        content: "❌ 画像ファイルが見つかりません",
        flags: 64,
      });
    }

    const imageBuffer = fs.readFileSync(imagePath);
    const attachment = new AttachmentBuilder(imageBuffer, {
      name: "stock.png",
    });

    fs.unlink(imagePath, () => {});

    const embed = new EmbedBuilder()
      .setColor(
        diff > 0 ? "Green" :
        diff < 0 ? "Red" :
        "Blue"
      )
      .setTitle("📈 株価情報")
      .setDescription(
        `**現在株価:** ${currentPrice.toLocaleString()} コイン\n` +
        `**前回比:** ${diffText}\n` +
        `**最低株価:** ${parsed.min.toLocaleString()} コイン\n` +
        `**最高株価:** ${parsed.max.toLocaleString()} コイン`
      )
      .setImage("attachment://stock.png");

    await interaction.editReply({
      embeds: [embed],
      files: [attachment],
    });
  });
}
