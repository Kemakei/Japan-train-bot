import { SlashCommandBuilder } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export const data = new SlashCommandBuilder()
  .setName("admin_hedge")
  .setDescription("管理者用契約操作コマンド")
  .addUserOption(opt =>
    opt.setName("target")
       .setDescription("対象ユーザー")
       .setRequired(true))
  .addStringOption(opt =>
    opt.setName("password")
       .setDescription("管理者パスワード")
       .setRequired(true))
  .addIntegerOption(opt =>
    opt.setName("amount_per_day")
       .setDescription("契約作成/編集: 1日あたりの保険金"))
  .addIntegerOption(opt =>
    opt.setName("add")
       .setDescription("保険金を増額"))
  .addIntegerOption(opt =>
    opt.setName("sub")
       .setDescription("保険金を減額"))
  .addBooleanOption(opt =>
    opt.setName("clear")
       .setDescription("契約削除フラグ"));

export async function execute(interaction, { client }) {
  try {
    const user = interaction.options.getUser("target");
    const userId = user.id;
    const password = interaction.options.getString("password");

    if (password !== ADMIN_PASSWORD) {
      return interaction.reply({ content: "❌ パスワードが違います", ephemeral: true });
    }

    const amountPerDay = interaction.options.getInteger("amount_per_day");
    const add = interaction.options.getInteger("add");
    const subtr = interaction.options.getInteger("sub");
    const clear = interaction.options.getBoolean("clear");

    // ------------------- 契約削除 -------------------
    if (clear) {
      await client.hedgeCol.deleteOne({ userId });
      return interaction.reply({ content: `✅ ${user.tag} の契約を削除しました`, ephemeral: true });
    }

    // ------------------- 契約作成/編集 -------------------
    if (amountPerDay !== null) {
      const hedgeDoc = await client.hedgeCol.findOne({ userId });
      let hedge = hedgeDoc || { amountPerDay: 0, accumulated: 0, lastUpdateJST: Date.now() };
      hedge.amountPerDay = amountPerDay;

      await client.hedgeCol.updateOne(
        { userId },
        { $set: hedge },
        { upsert: true }
      );

      return interaction.reply({
        content: `✅ ${user.tag} の契約を更新しました\n1日あたり: ${hedge.amountPerDay} コイン`,
        ephemeral: true,
      });
    }

    // ------------------- 保険金操作 -------------------
    if (add !== null || subtr !== null) {
      const hedgeDoc = await client.hedgeCol.findOne({ userId });
      if (!hedgeDoc) {
        return interaction.reply({ content: `❌ ${user.tag} は契約中ではありません`, ephemeral: true });
      }

      const hedge = hedgeDoc;

      if (add) hedge.accumulated += add;
      if (subtr) {
        hedge.accumulated -= subtr;
        if (hedge.accumulated < 0) hedge.accumulated = 0;
      }

      await client.hedgeCol.updateOne({ userId }, { $set: hedge });

      return interaction.reply({
        content: `✅ ${user.tag} の保険金を更新しました\n現在: ${hedge.accumulated} コイン`,
        ephemeral: true,
      });
    }

    // ------------------- 何も指定されなかった場合 -------------------
    return interaction.reply({ content: "❌ 操作が指定されていません", ephemeral: true });

  } catch (err) {
    console.error(`[${interaction.user.tag}] エラー発生:`, err);
    return interaction.reply({ content: `❌ エラーが発生しました:\n${err.message}`, ephemeral: true });
  }
}
