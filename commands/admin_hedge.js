import { SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export const data = new SlashCommandBuilder()
  .setName('admin_hedge')
  .setDescription('管理者用操作コマンド')
  .addStringOption(opt =>
    opt.setName('password')
       .setDescription('管理者パスワード')
       .setRequired(true))
  .addSubcommand(sub =>
    sub.setName('edit')
       .setDescription('ユーザーの保険金保険金契約を作成・編集')
       .addUserOption(opt => opt.setName('target').setDescription('対象ユーザー').setRequired(true))
       .addIntegerOption(opt => opt.setName('amount_per_day').setDescription('1日あたりの保険金'))
  )
  .addSubcommand(sub =>
    sub.setName('clear')
       .setDescription('ユーザーの契約を削除')
       .addUserOption(opt => opt.setName('target').setDescription('対象ユーザー').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('payout')
       .setDescription('保険金の操作（増減または空白でリセット）')
       .addUserOption(opt => opt.setName('target').setDescription('対象ユーザー').setRequired(true))
       .addIntegerOption(opt => opt.setName('add').setDescription('保険金を増やす'))
       .addIntegerOption(opt => opt.setName('sub').setDescription('保険金を減らす'))
  );

export async function execute(interaction, { client }) {
  try {
    const password = interaction.options.getString('password');
    if (password !== ADMIN_PASSWORD) {
      return interaction.reply({ content: '❌ パスワードが違います', flags: 64 });
    }

    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('target');
    const userId = user.id;

    // ------------------- 契約編集 -------------------
    if (sub === 'edit') {
      const amountPerDay = interaction.options.getInteger('amount_per_day');
      let hedge = client.getHedge(userId) || { amountPerDay: 0, accumulated: 0, lastUpdateJST: Date.now() };
      if (amountPerDay !== null) hedge.amountPerDay = amountPerDay;

      client.setHedge(userId, hedge);
      console.log(` ${interaction.user.tag} が ${user.tag} の契約を更新しました（1日あたり: ${hedge.amountPerDay} コイン）`);
      return interaction.reply({ content: `✅ ${user.tag} の契約を更新しました\n1日あたり: ${hedge.amountPerDay} コイン`, flags: 64 });
    }

    // ------------------- 契約削除 -------------------
    if (sub === 'clear') {
      client.clearHedge(userId);
      console.log(` ${interaction.user.tag} が ${user.tag} の契約を削除しました`);
      return interaction.reply({ content: ` ${user.tag} の契約を削除しました`, flags: 64 });
    }

    // ------------------- 保険金操作 -------------------
    if (sub === 'payout') {
      let hedge = client.getHedge(userId);
      if (!hedge) {
        return interaction.reply({ content: `❌ ${user.tag} は契約中ではありません`, flags: 64 });
      }

      const add = interaction.options.getInteger('add');
      const subtr = interaction.options.getInteger('sub');
      let actionLog = [];

      if (add === null && subtr === null) {
        hedge.accumulated = 0; 
        actionLog.push('リセット');
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

      client.setHedge(userId, hedge);
      console.log(` ${interaction.user.tag} が ${user.tag} の保険金を操作しました (${actionLog.join(', ')}), 現在: ${hedge.accumulated} コイン`);
      return interaction.reply({ content: ` ${user.tag} の保険金を更新しました\n現在: ${hedge.accumulated} コイン`, flags: 64 });
    }

  } catch (err) {
    return interaction.reply({ content: `❌ 操作中にエラーが発生しました:\n${err.message}`, flags: 64 });
  }
}
