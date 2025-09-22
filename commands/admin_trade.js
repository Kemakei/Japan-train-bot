import { SlashCommandBuilder } from "discord.js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const stocksFile = path.join(process.cwd(), "stocks.json");

function loadStocks() {
  if (!fs.existsSync(stocksFile)) fs.writeFileSync(stocksFile, JSON.stringify({}));
  return new Map(Object.entries(JSON.parse(fs.readFileSync(stocksFile, "utf-8"))));
}

function saveStocks(map) {
  fs.writeFileSync(stocksFile, JSON.stringify(Object.fromEntries(map), null, 2));
}

export const data = new SlashCommandBuilder()
  .setName("admin_trade")
  .setDescription("管理者用: ユーザーの株数を編集")
  .addUserOption(opt => opt.setName("target").setDescription("対象ユーザー").setRequired(true))
  .addIntegerOption(opt => opt.setName("amount").setDescription("増減する株数").setRequired(true))
  .addStringOption(opt => opt.setName("action").setDescription("操作の種類").setRequired(true)
    .addChoices(
      { name: "増やす", value: "add" },
      { name: "減らす", value: "subtract" },
      { name: "設定", value: "set" }
    ))
  .addStringOption(opt => opt.setName("password").setDescription("管理者パスワード").setRequired(true));

export async function execute(interaction) {
  const password = interaction.options.getString("password");
  if (password !== ADMIN_PASSWORD) return interaction.reply({ content: "❌ パスワードが違います", flags: 64 });

  const user = interaction.options.getUser("target");
  const amount = interaction.options.getInteger("amount");
  const action = interaction.options.getString("action");

  const stocks = loadStocks();
  let current = stocks.get(user.id) || 0;

  if (action === "add") current += amount;
  else if (action === "subtract") current = Math.max(0, current - amount);
  else if (action === "set") current = amount;

  stocks.set(user.id, current);
  saveStocks(stocks);

  console.log(`${interaction.user.tag} が ${user.tag} の株数を ${current} に更新しました`);
  return interaction.reply({ content: `✅ ${user.tag} の株数を ${current} に更新しました`, flags: 64 });
}
