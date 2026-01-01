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

// ===== 株マスタ（固定8社）=====
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

// messageId → { userId, pages, index }
const graphCache = new Map();

export const data = new SlashCommandBuilder()
  .setName("trade_graph")
  .setDescription("株価グラフ（ページ切り替え）");

export async function execute(interaction, { client }) {
  await interaction.deferReply();

  const pages = [];

  for (const stock of STOCKS) {
    // === MongoDBから履歴を取得 ===
    const historyDoc = await client.stockHistoryCol.findOne({ userId: `trade_history_${stock.id}` });
    const priceDoc = await client.stockHistoryCol.findOne({ userId: `stock_price_${stock.id}` });
    const tradeHistory = historyDoc?.history ?? [];
    const stockPrice = priceDoc?.currentPrice ?? stock.base;

    // === Python に渡す JSON ===
    const py = spawn("python", [path.resolve(__dirname, "../python/graph.py")]);

    py.stdin.write(JSON.stringify({
      trade_history: tradeHistory, // 必ずMongoDBのhistory配列
      stock_price: stockPrice      // fallback
    }));
    py.stdin.end();

    const output = await new Promise((resolve, reject) => {
      let out = "", err = "";
      py.stdout.on("data", d => out += d);
      py.stderr.on("data", d => err += d);
      py.on("close", code => code === 0 ? resolve(out) : reject(err));
    });

    const parsed = JSON.parse(output);
    const buffer = fs.readFileSync(parsed.image);
    fs.unlinkSync(parsed.image);

    pages.push({
      stock,
      buffer,
      current: parsed.current,
      min: parsed.min,
      max: parsed.max,
      delta: parsed.delta,
      deltaPercent: parsed.deltaPercent,
    });
  }

  const index = 0;
  const embed = buildEmbed(pages[index], index);
  const attachment = new AttachmentBuilder(pages[index].buffer, { name: "stock.png" });

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

function buildEmbed(page, index) {
  return new EmbedBuilder()
    .setTitle(`📈 ${page.stock.name}`)
    .setDescription(
      `**現在株価:** ${page.current.toLocaleString()} コイン\n` +
      `**変動:** ${page.delta >=0 ? "+" : ""}${page.delta} (${page.deltaPercent >= 0 ? "+" : ""}${page.deltaPercent}%)\n` +
      `**最低株価:** ${page.min.toLocaleString()} コイン\n` +
      `**最高株価:** ${page.max.toLocaleString()} コイン\n\n` +
      `ページ: ${index + 1} / ${STOCKS.length}`
    )
    .setImage("attachment://stock.png")
    .setColor("Blue");
}

function buildButtons(index) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`trade_graph_prev_${index}`)
      .setLabel("◀")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`trade_graph_next_${index}`)
      .setLabel("▶")
      .setStyle(ButtonStyle.Secondary),
  );
}

// ===== ButtonInteraction 側 =====
export async function handleButton(interaction) {
  if (!interaction.customId.startsWith("trade_graph_")) return;

  const state = graphCache.get(interaction.message.id);
  if (!state) return;

  if (interaction.user.id !== state.userId) {
    return interaction.reply({ content: "❌ 操作できません", ephemeral: true });
  }

  const parts = interaction.customId.split("_"); // trade_graph_prev_0
  const dir = parts[2]; // prev / next
  let index = state.index;

  if (dir === "next") index = (index + 1) % state.pages.length;
  if (dir === "prev") index = (index - 1 + state.pages.length) % state.pages.length;

  state.index = index; // 更新

  const page = state.pages[index];
  const embed = buildEmbed(page, index);
  const attachment = new AttachmentBuilder(page.buffer, { name: "stock.png" });

  await interaction.update({
    embeds: [embed],
    files: [attachment],
    components: [buildButtons(index)],
  });
}
