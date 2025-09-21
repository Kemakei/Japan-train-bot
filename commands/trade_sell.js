import { SlashCommandBuilder } from "discord.js";
import fs from "fs";
import path from "path";

const __dirname = path.resolve();
const coinsFile = path.join(__dirname, "../coins.json");
const INITIAL_PRICE = 950;

export const data = new SlashCommandBuilder()
  .setName("trade_sell")
  .setDescription("株を売却します")
  .addIntegerOption(opt => opt.setName("count").setDescription("売却する株数").setRequired(true));

export async function execute(interaction, client) {
  const raw = fs.existsSync(coinsFile) ? JSON.parse(fs.readFileSync(coinsFile, "utf-8")) : {};

  if (!raw.stock_price) raw.stock_price = INITIAL_PRICE;
  const price = raw.stock_price;

  // ユーザー初期化
  if (!raw[interaction.user.id]) raw[interaction.user.id] = { coins: 950, stock: 0 };
  const user = raw[interaction.user.id];

  const count = interaction.options.getInteger("count");
  if (count < 1 || user.stock < count) {
    return interaction.reply({ content: "売却株数が不正です", flags: 64 });
  }

  user.coins += count * price;
  user.stock -= count;

  // 株価変動
  raw.stock_price = Math.floor(price * (1 - count * 0.0005));

  fs.writeFileSync(coinsFile, JSON.stringify(raw, null, 2));

  return interaction.reply({ content: `株を${count}株売却しました` });
}
