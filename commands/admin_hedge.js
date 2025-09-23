import { SlashCommandBuilder } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export const data = new SlashCommandBuilder()
  .setName("admin_hedge")
  .setDescription("管理者用操作コマンド")
  .addSubcommand(sub =>
    sub.setName("edit")
       .setDescription("ユーザーの契約を作成・編集")
       .addUserOption(opt => opt.setName("target").setDescription("対象ユーザー").setRequired(true))
       .addStringOption(opt => opt.setName("password").setDescription("管理者パスワード").setRequired(true))
       .addIntegerOption(opt => opt.setName("amount_per_day").setDescription("1日あたりの保険金"))
  )
  .addSubcommand(sub =>
    sub.setName("clear")
       .setDescription("ユーザーの契約を削除")
       .addUserOption(opt => opt.setName("target").setDescription("対象ユーザー").setRequired(true))
       .addStringOption(opt => opt.setName("password").setDescription("管理者パスワード").setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName("payout")
       .setDescription("保険金操作（増減またはリセット）")
       .addUserOption(opt => opt.setName("target").setDescription("対象ユーザー").setRequired(true))
       .addStringOption(opt => opt.setName("password").setDescription("管理者パスワード").setRequired(true))
       .addIntegerOption(opt => opt.setName("add").setDescription("増額"))
       .addIntegerOption(opt => opt.setName("sub").setDescription("減額"))
  );

export async function execute(interaction, { client }) {
  try {
    const sub = interaction.options.getSubcommand();
    const password = interaction.options.getString("password");
    const user = interaction.options.getUser("target");
    const userId = user.id;

    if (password !== ADMIN_PASSWORD) {
      console.log(`[${interaction.user.tag}] パスワード間違い: ${user.tag}`);
      return interaction.reply({ content: "❌ パスワードが違います", flags: 64 });
    }

    // ------------------- 契約編集 -------------------
    if (sub === "edit") {
      const amountPerDay = interaction.options.getInteger("amount_per_day");

      // MongoDB 版 getHedge
      const hedgeDoc = await client.hedges.findOne({ userId });
      let hedge = hedgeDoc || { amountPerDay: 0, accumulated: 0, lastUpdateJST: Date.now() };
      if (amountPerDay !== null) hedge.amountPerDay = amountPerDay;

      await client.hedges.updateOne(
        { userId },
        { $set: hedge },
        { upsert: true }
      );

      console.log(`[${interaction.user.tag}] が [${user.tag}] の契約を編集（1日あたり: ${hedge.amountPerDay}）`);
      return interaction.reply({
        content: `✅ ${user.tag} の契約を更新しました\n1日あたり: ${hedge.amountPerDay} コイン`,
        flags: 64,
      });
    }

    // ------------------- 契約削除 -------------------
    if (sub === "clear") {
      await client.hedges.deleteOne({ userId });
      console.log(`[${interaction.user.tag}] が [${user.tag}] の契約を削除`);
      return interaction.reply({ content: `✅ ${user.tag} の契約を削除しました`, flags: 64 });
    }

    // ------------------- 保険金操作 -------------------
    if (sub === "payout") {
      const hedgeDoc = await client.hedges.findOne({ userId });
      if (!hedgeDoc) {
        console.log(`[${interaction.user.tag}] が [${user.tag}] の契約操作に失敗（契約なし）`);
        return interaction.reply({ content: `❌ ${user.tag} は契約中ではありません`, flags: 64 });
      }

      const hedge = hedgeDoc;
      const add = interaction.options.getInteger("add");
      const subtr = interaction.options.getInteger("sub");
      let actionLog = [];

      if (add === null && subtr === null) {
        hedge.accumulated = 0;
        actionLog.push("リセット");
      } else {
        if (add) {
          hedge.accumulated += add;
          actionLog.push(`+${add}`);
        }
        if (subtr) {
          hedge.accumulated -= subtr;
          if (hedge.accumulated < 0) hedge.accumulated = 0;
          actionLog.push(`-${subtr}`);
        }
      }

      await client.hedges.updateOne(
        { userId },
        { $set: hedge }
      );

      console.log(`[${interaction.user.tag}] が [${user.tag}] の保険金操作 (${actionLog.join(", ")}) 現在: ${hedge.accumulated}`);
      return interaction.reply({
        content: `✅ ${user.tag} の保険金を更新しました\n現在: ${hedge.accumulated} コイン`,
        flags: 64,
      });
    }

  } catch (err) {
    console.error(`[${interaction.user.tag}] エラー発生:`, err);
    return interaction.reply({ content: `❌ エラーが発生しました:\n${err.message}`, flags: 64 });
  }
}
