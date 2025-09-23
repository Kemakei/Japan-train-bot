import { SlashCommandBuilder } from "discord.js";

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
  .addIntegerOption(opt =>
    opt.setName("number")
       .setDescription("5桁の宝くじ番号")
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
    const number = interaction.options.getInteger("number");
    const letterInput = interaction.options.getString("letter");
    const letter = letterInput?.toUpperCase();

    if (action === "add") {
      if (number === null || !letter) {
        return interaction.reply({ content: "❌ 追加する場合は番号と文字を指定してください", flags: 64 });
      }
      if (number < 10000 || number > 99999) {
        return interaction.reply({ content: "❌ 番号は5桁で指定してください", flags: 64 });
      }
      if (!/^[A-Z]$/.test(letter)) {
        return interaction.reply({ content: "❌ 文字は A-Z の1文字で指定してください", flags: 64 });
      }

      const purchase = {
        number: String(number),
        letter,
        drawNumber: null,
        drawLetter: null,
        claimed: false,
        createdAt: new Date()
      };

      const result = await client.lotteryCol.updateOne(
        { userId },
        { $push: { purchases: purchase } },
        { upsert: true }
      );

      if (result.acknowledged) {
        console.log(`${interaction.user.tag} が <@${userId}> に宝くじ ${number}${letter} を追加しました`);
      }

      return interaction.reply({ content: `✅ <@${userId}> に宝くじ ${number}${letter} を追加しました`, flags: 64 });

    } else if (action === "remove") {
      if ((number !== null || letter) && !(number !== null && letter)) {
        return interaction.reply({ content: "❌ 削除する場合は番号と文字を両方指定してください", flags: 64 });
      }

      if (number !== null && letter) {
        if (number < 10000 || number > 99999) {
          return interaction.reply({ content: "❌ 番号は5桁で指定してください", flags: 64 });
        }
        if (!/^[A-Z]$/.test(letter)) {
          return interaction.reply({ content: "❌ 文字は A-Z の1文字で指定してください", flags: 64 });
        }

        const result = await client.lotteryCol.updateOne(
          { userId },
          { $pull: { purchases: { number: String(number), letter } } }
        );

        if (result.modifiedCount > 0) {
          console.log(`${interaction.user.tag} が <@${userId}> の宝くじ ${number}${letter} を削除しました`);
          return interaction.reply({ content: `✅ <@${userId}> の宝くじ ${number}${letter} を削除しました`, flags: 64 });
        } else {
          return interaction.reply({ content: `⚠️ 指定された宝くじは見つかりませんでした`, flags: 64 });
        }
      } else {
        const result = await client.lotteryCol.updateOne(
          { userId },
          { $set: { purchases: [] } }
        );

        if (result.modifiedCount > 0) {
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
