// commands/graph.js
import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";

const __dirname = path.resolve();
const stockImagePath = path.join(__dirname, "../python/stock.png");

export const data = new SlashCommandBuilder()
  .setName("graph")
  .setDescription("株価グラフを表示します");

export async function execute(interaction, { client }) {
  await interaction.deferReply();

  try {
    // Map から最新 trade_history を取得し、一時 JSON に保存
    const tmpTradeFile = path.join(__dirname, "../python/tmp_trade_history.json");
    const tradeHistory = client.coins.get("trade_history") || [];
    fs.writeFileSync(tmpTradeFile, JSON.stringify({ trade_history: tradeHistory }, null, 2));

    // Pythonスクリプト実行
    execFile(
      "python3",
      [path.join(__dirname, "../python/graph.py"), tmpTradeFile, stockImagePath],
      (err) => {
        if (err) {
          console.error(err);
          return interaction.editReply({ content: "グラフ生成に失敗しました", flags: 64 });
        }

        const attachment = new AttachmentBuilder(stockImagePath, { name: "stock.png" });
        interaction.editReply({ content: "株価の推移（直近1日）", files: [attachment] });
      }
    );
  } catch (err) {
    console.error(err);
    interaction.editReply({ content: "グラフ生成に失敗しました", flags: 64 });
  }
}
