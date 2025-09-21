import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";

const __dirname = path.resolve();
const stockImagePath = path.join(__dirname, "../python/stock.png");
const stockJsonPath = path.join(__dirname, "../coins.json");

export const data = new SlashCommandBuilder()
  .setName("graph")
  .setDescription("株価グラフを表示します");

export async function execute(interaction) {
  await interaction.deferReply();

  // coins.json がなければ初期化
  if (!fs.existsSync(stockJsonPath)) {
    fs.writeFileSync(stockJsonPath, JSON.stringify({ stock_price: 950, trade_history: [] }, null, 2));
  }

  execFile("python3", [path.join(__dirname, "../python/graph.py")], (err) => {
    if (err) {
      console.error(err);
      return interaction.editReply({ content: "グラフ生成に失敗しました", flags: 64 });
    }
    const attachment = new AttachmentBuilder(stockImagePath, { name: "stock.png" });
    interaction.editReply({ content: "株価の推移（直近1日）", files: [attachment] });
  });
}
