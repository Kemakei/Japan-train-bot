import {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STOCKS = [
  { id: "A", name: "tootle株式会社" },
  { id: "B", name: "ハイシロソフト株式会社" },
  { id: "C", name: "バナナ株式会社" },
  { id: "D", name: "ネムーイ株式会社" },
  { id: "E", name: "ナニイッテンノー株式会社" },
  { id: "F", name: "ダカラナニー株式会社" },
  { id: "G", name: "ホシーブックス株式会社" },
  { id: "H", name: "ランランルー株式会社" },
];

const graphCache = new Map();

export const data = new SlashCommandBuilder()
  .setName("trade_graph")
  .setDescription("株価グラフ");

export async function execute(interaction, { client }) {
  await interaction.deferReply();
  const pages = [];

  for (const stock of STOCKS) {
    const historyDoc = await client.coinsCol.findOne({
      userId: `trade_history_${stock.id}`
    });
    const price = await client.getStockPrice(stock.id);

    const py = spawn("python3", [
      path.resolve(__dirname, "../python/graph.py"),
    ]);

    py.stdin.write(JSON.stringify({
      trade_history: historyDoc?.coins || [],
      stock_price: price,
    }));
    py.stdin.end();

    const out = await new Promise((res, rej) => {
      let data = "";
      py.stdout.on("data", d => data += d);
      py.on("close", () => res(data));
    });

    const parsed = JSON.parse(out);
    const buffer = fs.readFileSync(parsed.image);
    fs.unlinkSync(parsed.image);

    pages.push({ stock, buffer, ...parsed });
  }

  const msg = await interaction.editReply(render(pages, 0));
  graphCache.set(msg.id, { pages, index: 0, userId: interaction.user.id });
}

function render(pages, index) {
  const p = pages[index];
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(p.stock.name)
        .setDescription(
          `現在:${p.current}\n最小:${p.min}\n最大:${p.max}\n${index+1}/8`
        )
        .setImage("attachment://stock.png")
    ],
    files: [new AttachmentBuilder(p.buffer, { name: "stock.png" })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("trade_graph_prev").setLabel("◀").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("trade_graph_next").setLabel("▶").setStyle(ButtonStyle.Secondary),
    )]
  };
}

export async function handleButton(interaction) {
  const state = graphCache.get(interaction.message.id);
  if (!state || state.userId !== interaction.user.id) return;

  state.index += interaction.customId.endsWith("next") ? 1 : -1;
  state.index = (state.index + state.pages.length) % state.pages.length;

  await interaction.update(render(state.pages, state.index));
}