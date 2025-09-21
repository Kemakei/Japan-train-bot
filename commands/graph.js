// commands/graph.js
import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import path from "path";
import { execFile } from "child_process";

const __dirname = path.resolve();
const stockImagePath = path.join(__dirname, "../python/stock.png");

export const data = new SlashCommandBuilder()
  .setName("graph")
  .setDescription("株価グラフを表示します");

export async function execute(interaction) {
  await interaction.deferReply();
  try {
    execFile("python3", [path.join(__dirname, "../python/graph.py")], (err) => {
      if (err) return interaction.editReply({ content: "グラフ生成に失敗しました", flags: 64 });
      const attachment = new AttachmentBuilder(stockImagePath, { name: "stock.png" });
      interaction.editReply({ content: "株価の推移（直近1日）", files: [attachment] });
    });
  } catch (err) {
    console.error(err);
    return interaction.editReply({ content: "グラフ生成に失敗しました", flags: 64 });
  }
}
