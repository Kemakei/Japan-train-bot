import { SlashCommandBuilder } from "discord.js";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

// __dirname を ESM で定義
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const data = new SlashCommandBuilder()
  .setName("graph")
  .setDescription("株価折れ線グラフ表示");

export async function execute(interaction, { client }) {
  await interaction.deferReply();

  // graph.js の場所を基準に python/graph.py を探す
  const pythonPath = path.resolve(__dirname, "../python/graph.py");
  const pythonCmd = process.platform === "win32" ? "py" : "python3";

  const tradeHistory = client.coins.get("trade_history")?.coins || [];
  const stockPrice = client.coins.get("stock_price")?.coins || 950;
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
