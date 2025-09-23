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
      console.log(`[${interaction.user.tag}] パスワード間違い: ${user.tag}`);
      return interaction.reply({ content: "❌ パスワードが違います", flags: 64 });
    }

    const amountPerDay = interaction.options.getInteger("amount_per_day");
    const add = interaction.options.getInteger("add");
    const subtr = interaction.options.getInteger("sub");
    const clear = interaction.options.getBoolean("clear");

    // ------------------- 契約削除 -------------------
    if (clear) {
      await client.hedges.deleteOne({ userId });
      console.log(`[${interaction.user.tag}] が [${user.tag}] の契約を削除`);
      return interaction.reply({ content: `✅ ${user.tag} の契約を削除しました`, flags: 64 });
    }

    // ------------------- 契約作成/編集 -------------------
    if (amountPerDay !== null) {
      const hedgeDoc = await client.hedges.findOne({ userId });
      let hedge = hedgeDoc || { amountPerDay: 0, accumulated: 0, lastUpdateJST: Date.now() };
      hedge.amountPerDay = amountPerDay;

      await client.hedges.updateOne(
        { userId },
        { $set: hedge },
        { upsert: true }
      );

      console.log(`[${interaction.user.tag}] が [${user.tag}] の契約を更新（1日あたり: ${hedge.amountPerDay}）`);
      return interaction.reply({
        content: `✅ ${user.tag} の契約を更新しました\n1日あたり: ${hedge.amountPerDay} コイン`,
        flags: 64,
      });
    }

    // ------------------- 保険金操作 -------------------
    if (add !== null || subtr !== null) {
      const hedgeDoc = await client.hedges.findOne({ userId });
      if (!hedgeDoc) {
        console.log(`[${interaction.user.tag}] が [${user.tag}] の保険金操作に失敗（契約なし）`);
        return interaction.reply({ content: `❌ ${user.tag} は契約中ではありません`, flags: 64 });
      }

      const hedge = hedgeDoc;
      const actionLog = [];

      if (add) {
        hedge.accumulated += add;
        actionLog.push(`+${add}`);
      }
      if (subtr) {
        hedge.accumulated -= subtr;
        if (hedge.accumulated < 0) hedge.accumulated = 0;
        actionLog.push(`-${subtr}`);
      }

      await client.hedges.updateOne({ userId }, { $set: hedge });

      console.log(`[${interaction.user.tag}] が [${user.tag}] の保険金操作 (${actionLog.join(", ")}) 現在: ${hedge.accumulated}`);
      return interaction.reply({
        content: `✅ ${user.tag} の保険金を更新しました\n現在: ${hedge.accumulated} コイン`,
        flags: 64,
      });
    }

    // 何も操作が指定されなかった場合
    return interaction.reply({ content: "❌ 操作が指定されていません", flags: 64 });

  } catch (err) {
    console.error(`[${interaction.user.tag}] エラー発生:`, err);
    return interaction.reply({ content: `❌ エラーが発生しました:\n${err.message}`, flags: 64 });
  }
}
