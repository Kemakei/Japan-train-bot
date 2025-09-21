import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COINS_FILE = path.join(__dirname, "../coins.json");
const INITIAL_PRICE = 950;

// 株価自動更新（10分ごと）
setInterval(() => {
  try {
    const raw = JSON.parse(fs.readFileSync(COINS_FILE, "utf-8"));
    let price = raw.stock_price ?? INITIAL_PRICE;

    const hour = new Date().getHours();
    let volatility = 0.002;
    if (hour < 6) volatility = 0.001;
    else if (hour < 12) volatility = 0.003;
    else if (hour < 18) volatility = 0.005;
    else volatility = 0.002;

    const changePercent = (Math.random() * 2 - 1) * volatility;
    const newPrice = Math.max(1, Math.floor(price * (1 + changePercent)));

    raw.stock_price = newPrice;
    if (!raw.history) raw.history = [];
    raw.history.push({ time: new Date().toISOString(), price: newPrice });
    raw.history = raw.history.filter(d => new Date(d.time) >= new Date(Date.now() - 24*60*60*1000));

    fs.writeFileSync(COINS_FILE, JSON.stringify(raw, null, 2));
    console.log(`株価更新: ${price} → ${newPrice}`);
  } catch (e) {
    console.error("株価更新エラー:", e);
  }
}, 600_000);

// スラッシュコマンド定義
export const data = [
  new SlashCommandBuilder().setName("graph").setDescription("株価グラフを表示します"),
  new SlashCommandBuilder().setName("trade_buy").setDescription("株を購入します")
    .addIntegerOption(opt => opt.setName("count").setDescription("購入する株数").setRequired(true)),
  new SlashCommandBuilder().setName("trade_sell").setDescription("株を売却します")
    .addIntegerOption(opt => opt.setName("count").setDescription("売却する株数").setRequired(true))
];

export async function execute(interaction) {
  const command = interaction.commandName;
  const raw = JSON.parse(fs.readFileSync(COINS_FILE, "utf-8"));
  if (!raw.stock_price) raw.stock_price = INITIAL_PRICE;
  const price = raw.stock_price;

  if (!raw[interaction.user.id]) raw[interaction.user.id] = { coins: 0, stock: 0 };
  const user = raw[interaction.user.id];

  // 株購入
  if (command === "trade_buy") {
    const count = interaction.options.getInteger("count");
    if (count < 1) return interaction.reply({ content: "1株以上指定してください", flags: 64 });

    const commission = Math.floor(count * price * 0.03 + count * 0.5);
    if (user.coins < count * price + commission) return interaction.reply({ content: "所持金が不足しています", flags: 64 });

    user.coins -= count * price + commission;
    user.stock += count;
    raw.stock_price = Math.floor(price * (1 + count*0.0005));
    fs.writeFileSync(COINS_FILE, JSON.stringify(raw, null, 2));

    return interaction.reply({ content: `株を${count}株購入しました（手数料: ${commission}コイン）` });
  }

  // 株売却
  if (command === "trade_sell") {
    const count = interaction.options.getInteger("count");
    if (count < 1 || user.stock < count) return interaction.reply({ content: "売却株数が不正です", flags: 64 });

    user.coins += count * price;
    user.stock -= count;
    raw.stock_price = Math.floor(price * (1 - count*0.0005));
    fs.writeFileSync(COINS_FILE, JSON.stringify(raw, null, 2));

    return interaction.reply({ content: `株を${count}株売却しました` });
  }

  // 株価グラフ
  if (command === "graph") {
    await interaction.deferReply();
    try {
      const pythonPath = path.join(__dirname, "../python/graph.py");
      await new Promise((resolve, reject) => {
        execFile("python3", [pythonPath], (error, stdout, stderr) => {
          if (error) reject(stderr);
          else resolve(stdout);
        });
      });

      const attachmentPath = path.join(__dirname, "../python/stock.png");
      const attachment = new AttachmentBuilder(attachmentPath, { name: "stock.png" });
      return interaction.editReply({ content: "株価の推移（直近24時間）", files: [attachment] });
    } catch (err) {
      console.error(err);
      return interaction.editReply({ content: "グラフ生成に失敗しました", flags: 64 });
    }
  }
}
