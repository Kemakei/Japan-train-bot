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

// ===== 株マスタ =====
const STOCKS = [
  { id: "A", name: "tootle株式会社", base: 1000 },
  { id: "B", name: "ハイシロソフト株式会社", base: 1200 },
  { id: "C", name: "バナナ株式会社", base: 800 },
  { id: "D", name: "ネムーイ株式会社", base: 600 },
  { id: "E", name: "ナニイッテンノー株式会社", base: 1500 },
  { id: "F", name: "ダカラナニー株式会社", base: 900 },
  { id: "G", name: "ホシーブックス株式会社", base: 1100 },
  { id: "H", name: "ランランルー株式会社", base: 2000 },
];

// messageId → state
const graphCache = new Map();

export const data = new SlashCommandBuilder()
  .setName("trade_graph")
  .setDescription("株価グラフ");

export async function execute(interaction, { client }) {
  await interaction.deferReply();

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const stocksPayload = [];

  // ============================
  // MongoDB → 24h分だけ抽出
  // ============================
  for (const stock of STOCKS) {
    const historyDoc = await client.stockHistoryCol.findOne({
      userId: `trade_history_${stock.id}`,
    });

    const priceDoc = await client.stockHistoryCol.findOne({
      userId: `stock_price_${stock.id}`,
    });

    const rawHistory = historyDoc?.history ?? [];
    const history = rawHistory.filter(h => {
      const t = new Date(h.time || h.timestamp || h.date).getTime();
      return !isNaN(t) && t >= cutoff;
    });

    stocksPayload.push({
      id: stock.id,
      name: stock.name,
      history,
      price: priceDoc?.currentPrice ?? stock.base,
    });
  }

  // ============================
  // Python 起動（1回）
  // ============================
  const py = spawn("python", [
    path.resolve(__dirname, "../python/graph.py"),
  ]);

  py.stdin.write(JSON.stringify({ stocks: stocksPayload }));
  py.stdin.end();

  const output = await new Promise((resolve, reject) => {
    let out = "";
    let err = "";

    py.stdout.on("data", d => (out += d));
    py.stderr.on("data", d => console.error("[PY]", d.toString()));

    py.on("close", code => {
      if (code === 0) resolve(out);
      else reject(err);
    });
  });

  const results = JSON.parse(output);

  // ============================
  // ページ構築
  // ============================
  const pages = results.map(r => {
    const stock = STOCKS.find(s => s.id === r.id);
    const buffer = fs.readFileSync(r.image);
    fs.unlinkSync(r.image);

    return {
      stock,
      buffer,
      current: r.current,
      min: r.min,
      max: r.max,
      delta: r.delta,
      deltaPercent: r.deltaPercent,
    };
  });

  const index = 0;
  const embed = buildEmbed(pages[index], index);
  const attachment = new AttachmentBuilder(pages[index].buffer, {
    name: "stock.png",
  });

  const message = await interaction.editReply({
    embeds: [embed],
    files: [attachment],
    components: [buildButtons(index)],
  });

  graphCache.set(message.id, {
    userId: interaction.user.id,
    pages,
    index,
  });
}

// ============================
// Embed
// ============================
function buildEmbed(page, index) {
  return new EmbedBuilder()
    .setTitle(`📈 ${page.stock.name}`)
    .setDescription(
      `**現在株価:** ${page.current.toLocaleString()} コイン\n` +
      `**変動:** ${page.delta >= 0 ? "+" : ""}${page.delta} コイン ` +
      `(${page.deltaPercent >= 0 ? "+" : ""}${page.deltaPercent}%)\n` +
      `**最低株価:** ${page.min.toLocaleString()} コイン\n` +
      `**最高株価:** ${page.max.toLocaleString()} コイン\n\n` +
      `ページ: ${index + 1} / ${STOCKS.length}`
    )
    .setImage("attachment://stock.png")
    .setColor("Blue");
}

// ============================
// Buttons
// ============================
function buildButtons(index) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`trade_graph_prev_${index}`)
      .setLabel("◀")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`trade_graph_next_${index}`)
      .setLabel("▶")
      .setStyle(ButtonStyle.Secondary)
  );
}

// ============================
// Button Interaction
// ============================
export async function handleButton(interaction) {
  if (!interaction.customId.startsWith("trade_graph_")) return;

  const state = graphCache.get(interaction.message.id);
  if (!state) return;

  if (interaction.user.id !== state.userId) {
    return interaction.reply({
      content: "❌ 操作できません",
      ephemeral: true,
    });
  }

  const dir = interaction.customId.split("_")[2];
  let index = state.index;

  if (dir === "next") index = (index + 1) % state.pages.length;
  if (dir === "prev")
    index = (index - 1 + state.pages.length) % state.pages.length;

  state.index = index;

  const page = state.pages[index];
  const embed = buildEmbed(page, index);
  const attachment = new AttachmentBuilder(page.buffer, {
    name: "stock.png",
  });

  await interaction.update({
    embeds: [embed],
    files: [attachment],
    components: [buildButtons(index)],
  });
}
