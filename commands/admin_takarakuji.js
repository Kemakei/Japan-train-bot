// -------------------- admin_takarakuji.js --------------------
import { SlashCommandBuilder } from "discord.js";
import { getNextDrawId } from '../utils/draw.js';

export const data = new SlashCommandBuilder()
  .setName("admin_takarakuji")
  .setDescription("管理者用: ユーザーの宝くじ購入を追加・削除")
  .addStringOption(opt =>
    opt.setName("password")
       .setDescription("管理者パスワード")
       .setRequired(true))
  .addStringOption(opt =>
    opt.setName("userid")
       .setDescription("対象ユーザーIDまたはメンション")
       .setRequired(true))
  .addStringOption(opt =>
    opt.setName("action")
       .setDescription("操作: add=追加, remove=削除")
       .setRequired(true)
       .addChoices(
         { name: "追加", value: "add" },
         { name: "削除", value: "remove" }
       ))
  .addStringOption(opt =>
    opt.setName("number")
       .setDescription("5桁の宝くじ番号（先頭0も可）")
       .setRequired(false))
  .addStringOption(opt =>
    opt.setName("letter")
       .setDescription("宝くじの1文字（A-Z）")
       .setRequired(false));

export async function execute(interaction, { client }) {
  try {
    const password = interaction.options.getString("password");
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    if (password !== ADMIN_PASSWORD) {
      return interaction.reply({ content: "❌ パスワードが間違っています", flags: 64 });
    }

    const userInput = interaction.options.getString("userid");
    const userId = userInput.replace(/[<@!>]/g, "").trim();
    const action = interaction.options.getString("action");
    const numberInput = interaction.options.getString("number");
    const number = numberInput?.trim(); // ← 文字列として扱う
    const letterInput = interaction.options.getString("letter");
    const letter = letterInput?.toUpperCase();

    if (action === "add") {
      if (!number || !letter) {
        return interaction.reply({ content: "❌ 追加する場合は番号と文字を指定してください", flags: 64 });
      }
      if (!/^\d{5}$/.test(number)) {
        return interaction.reply({ content: "❌ 番号は5桁の数字で指定してください", flags: 64 });
      }
      if (!/^[A-Z]$/.test(letter)) {
        return interaction.reply({ content: "❌ 文字は A-Z の1文字で指定してください", flags: 64 });
      }

      const drawId = getNextDrawId(new Date());
      const purchase = {
        userId, // ← 追加必須
        number,
        letter,
        drawId,
        claimed: false,
        createdAt: new Date()
      };

      // --- 修正箇所: lotteryTickets に追加 ---
      await client.lotteryTickets.insertOne(purchase);

      console.log(`${interaction.user.tag} が <@${userId}> に宝くじ ${number}${letter} を追加しました`);
      return interaction.reply({ content: `✅ <@${userId}> に宝くじ ${number}${letter} を追加しました`, flags: 64 });

    } else if (action === "remove") {
      if ((number || letter) && !(number && letter)) {
        return interaction.reply({ content: "❌ 削除する場合は番号と文字を両方指定してください", flags: 64 });
      }

      if (number && letter) {
        if (!/^\d{5}$/.test(number)) {
          return interaction.reply({ content: "❌ 番号は5桁の数字で指定してください", flags: 64 });
        }
        if (!/^[A-Z]$/.test(letter)) {
          return interaction.reply({ content: "❌ 文字は A-Z の1文字で指定してください", flags: 64 });
        }

        // --- 修正箇所: lotteryTickets から1枚削除 ---
        const result = await client.lotteryTickets.deleteOne({ userId, number, letter });

        if (result.deletedCount > 0) {
          console.log(`${interaction.user.tag} が <@${userId}> の宝くじ ${number}${letter} を削除しました`);
          return interaction.reply({ content: `✅ <@${userId}> の宝くじ ${number}${letter} を削除しました`, flags: 64 });
        } else {
          return interaction.reply({ content: `⚠️ 指定された宝くじは見つかりませんでした`, flags: 64 });
        }
      } else {
        // --- 修正箇所: lotteryTickets から全削除 ---
        const result = await client.lotteryTickets.deleteMany({ userId });

        if (result.deletedCount > 0) {
          console.log(`${interaction.user.tag} が <@${userId}> のすべての宝くじを削除しました`);
        }

        return interaction.reply({ content: `✅ <@${userId}> のすべての宝くじを削除しました`, flags: 64 });
      }
    } else {
      return interaction.reply({ content: "❌ 不正なアクションです", flags: 64 });
    }

  } catch (err) {
    console.error("admin_takarakuji エラー:", err);
    return interaction.reply({ content: "❌ エラーが発生しました", flags: 64 });
  }
}
