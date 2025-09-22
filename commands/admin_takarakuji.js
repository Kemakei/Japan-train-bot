import { SlashCommandBuilder } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export const data = new SlashCommandBuilder()
  .setName("admin_takarakuji")
  .setDescription("管理者用: ユーザーの宝くじ購入を追加")
  .addStringOption(opt =>
    opt.setName("password")
       .setDescription("管理者パスワード")
       .setRequired(true))
  .addStringOption(opt =>
    opt.setName("userid")
       .setDescription("対象ユーザーIDまたはメンション")
       .setRequired(true))
  .addIntegerOption(opt =>
    opt.setName("number")
       .setDescription("5桁の宝くじ番号")
       .setRequired(true))
  .addStringOption(opt =>
    opt.setName("letter")
       .setDescription("宝くじの1文字（A-Z）")
       .setRequired(true));

export async function execute(interaction, { client }) {
  try {
    const password = interaction.options.getString("password");
    if (password !== ADMIN_PASSWORD) {
      return interaction.reply({ content: "❌ パスワードが間違っています", flags: 64 });
    }

    const userInput = interaction.options.getString("userid");
    const userId = userInput.replace(/[<@!>]/g, "").trim();
    const number = interaction.options.getInteger("number");
    const letter = (interaction.options.getString("letter") || "").toUpperCase();

    if (number < 10000 || number > 99999) {
      return interaction.reply({ content: "❌ 番号は5桁で指定してください", flags: 64 });
    }
    if (!/^[A-Z]$/.test(letter)) {
      return interaction.reply({ content: "❌ 文字は A-Z の1文字で指定してください", flags: 64 });
    }

    const purchase = { number: String(number), letter, drawNumber: null, drawLetter: null, claimed: false };
    const purchases = client.takarakujiPurchases.get(userId) || [];
    purchases.push(purchase);
    client.takarakujiPurchases.set(userId, purchases);

    return interaction.reply({ content: `✅ <@${userId}> に宝くじ ${number}${letter} を追加しました`, flags: 64 });
  } catch (err) {
    console.error("admin_takarakuji エラー:", err);
    return interaction.reply({ content: "❌ エラーが発生しました", flags: 64 });
  }
}
