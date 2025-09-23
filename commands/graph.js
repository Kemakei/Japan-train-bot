import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from "discord.js";
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

  // MongoDB版：非同期で trade_history と stock_price を取得
  const tradeHistoryDoc = await client.coinsCol.findOne({ userId: "trade_history" });
  const tradeHistory = Array.isArray(tradeHistoryDoc?.coins) ? tradeHistoryDoc.coins : [];

  const stockPriceDoc = await client.coinsCol.findOne({ userId: "stock_price" });
  const stockPrice = typeof stockPriceDoc?.coins === "number" ? stockPriceDoc.coins : 950;

  const dataToSend = JSON.stringify({ trade_history: tradeHistory, stock_price: stockPrice });

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

  py.on("close", (code) => {
    if (code !== 0) {
      console.error(errorOutput);
      return interaction.editReply({ content: "❌ グラフ生成失敗", flags: 64 });
    }

    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch {
      return interaction.editReply({ content: "❌ グラフ情報の解析に失敗しました", flags: 64 });
    }

    const attachment = new AttachmentBuilder(parsed.image, { name: "stock.png" });

    const embed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle("📈 株価情報")
      .setDescription(
        `**現在株価:** ${parsed.current} コイン\n` +
        `**最低株価:** ${parsed.min} コイン\n` +
        `**最高株価:** ${parsed.max} コイン`
      )
      .setImage("attachment://stock.png");

    interaction.editReply({ embeds: [embed], files: [attachment] });
  });
}
