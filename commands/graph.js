import { SlashCommandBuilder } from "discord.js";
import { spawn } from "child_process";
import path from "path";
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

  // 安全に trade_history と stock_price を取得
  const tradeHistoryObj = client.coins.get("trade_history");
  const tradeHistory = Array.isArray(tradeHistoryObj?.coins)
    ? tradeHistoryObj.coins
    : Array.isArray(tradeHistoryObj)
      ? tradeHistoryObj
      : [];

  const stockPriceObj = client.coins.get("stock_price");
  const stockPrice = typeof stockPriceObj?.coins === "number"
    ? stockPriceObj.coins
    : 950;

  const dataToSend = JSON.stringify({ trade_history: tradeHistory, stock_price: stockPrice });

  const py = spawn(pythonCmd, [pythonPath]);
  py.stdin.write(dataToSend);
  py.stdin.end();

  const outputPath = path.resolve(__dirname, "../stock.png");
  let errorOutput = "";

  py.stderr.on("data", (data) => {
    errorOutput += data.toString();
  });

  py.on("close", (code) => {
    if (code !== 0) {
      console.error(errorOutput);
      return interaction.editReply("❌ グラフ生成失敗");
    }
    interaction.editReply({ files: [outputPath] });
  });
}
