// commands/trade_buy.js
import { SlashCommandBuilder } from "discord.js";
import fs from "fs";
import path from "path";

const __dirname = path.resolve();
const coinsFile = path.join(__dirname, "../coins.json");
const INITIAL_PRICE = 950;

export const data = new SlashCommandBuilder()
  .setName("trade_buy")
  .setDescription("株を購入します")
  .addIntegerOption(opt => opt.setName("count").setDescription("購入する株数").setRequired(true));

export async function execute(interaction) {
  const raw = fs.existsSync(coinsFile) ? JSON.parse(fs.readFileSync(coinsFile, "utf-8")) : {};
  if (!raw.stock_price) raw.stock_price = INITIAL_PRICE;
  const price = raw.stock_price;

  if (!raw[interaction.user.id]) raw[interaction.user.id] = { coins: 0, stock: 0 };
  const user = raw[interaction.user.id];

  const count = interaction.options.getInteger("count");
  if (count < 1) return interaction.reply({ content: "1株以上指定してください", flags: 64 });

  const commission = Math.floor(count * price * 0.03 + count * 0.5);
  if (user.coins < count * price + commission) {
    return interaction.reply({ content: "所持金が不足しています（手数料込み）", flags: 64 });
  }

  user.coins -= count * price + commission;
  user.stock = (user.stock || 0) + count;
  raw.stock_price = Math.floor(price * (1 + count * 0.0005));

  fs.writeFileSync(coinsFile, JSON.stringify(raw, null, 2));

  return interaction.reply({ content: `株を${count}株購入しました（手数料: ${commission}コイン）` });
}
