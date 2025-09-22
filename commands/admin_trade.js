import { SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export const data = new SlashCommandBuilder()
  .setName('admin_trade')
  .setDescription('管理者用: ユーザーの株数を編集します')
  .addUserOption(option => 
    option.setName('target')
      .setDescription('対象ユーザー')
      .setRequired(true))
  .addIntegerOption(option => 
    option.setName('amount')
      .setDescription('増減する株数')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('action')
      .setDescription('操作の種類')
      .setRequired(true)
      .addChoices(
        { name: '増やす', value: 'add' },
        { name: '減らす', value: 'subtract' },
        { name: '設定', value: 'set' }
      ))
  .addStringOption(option =>
    option.setName('password')
      .setDescription('管理者パスワード')
      .setRequired(true));

export async function execute(interaction, { client }) {
  const password = interaction.options.getString('password');
  if (password !== ADMIN_PASSWORD) {
    return interaction.reply({ content: '❌ パスワードが間違っています', flags: 64 });
  }

  const user = interaction.options.getUser('target');
  const amount = interaction.options.getInteger('amount');
  const action = interaction.options.getString('action');

  let currentCoins = client.getCoins(user.id);

  if (action === 'add') {
    client.updateCoins(user.id, amount);
    currentCoins += amount;
  } else if (action === 'subtract') {
    client.updateCoins(user.id, -amount);
    currentCoins -= amount;
  } else if (action === 'set') {
    client.setCoins(user.id, amount);
    currentCoins = amount;
  }

  console.log(`${interaction.user.tag} が ${user.tag} の保有株を ${currentCoins} に更新しました`);

  return interaction.reply({ content: `✅ ${user.tag} の保有株を ${currentCoins} に更新しました`, flags: 64 });
}
