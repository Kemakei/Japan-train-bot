import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import path from "path";
import { execFile } from "child_process";

const __dirname = path.resolve();
const stockImagePath = path.join(__dirname, "../python/stock.png");

export const data = new SlashCommandBuilder()
  .setName("graph")
  .setDescription("株価グラフを表示します");

export async function execute(interaction, { client }) {
  try {
    if (!interaction.deferred) await interaction.deferReply();
    execFile(
      "python3",
      [path.join(__dirname, "../python/graph.py")],
      { encoding: "utf-8" },
      (err, stdout, stderr) => {
        if (err) {
          console.error("Python error:", stderr || err);
          return interaction.editReply({ content: "グラフ生成に失敗しました" });
        }
        const attachment = new AttachmentBuilder(stockImagePath, { name: "stock.png" });
        interaction.editReply({ content: "株価の推移（直近1日）", files: [attachment] });
      }
    );
  } catch (err) {
    console.error(err);
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content: "グラフ生成に失敗しました" });
    } else {
      await interaction.reply({ content: "グラフ生成に失敗しました" });
    }
  }
}
