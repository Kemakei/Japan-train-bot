import { SlashCommandBuilder } from 'discord.js';

const symbols = ["🍒", "🍋", "🍊", "💎", "7️⃣"];
const bigJackpot = { "🍒": 250, "🍋": 250, "🍊": 400, "💎": 500, "7️⃣": 750 };
const smallJackpot = Object.fromEntries(
  Object.entries(bigJackpot).map(([k, v]) => [k, Math.ceil(v / 2)])
);

export const data = new SlashCommandBuilder()
  .setName('slot')
  .setDescription('スロットで遊ぶ！')
  .addIntegerOption(option =>
    option.setName('bet')
      .setDescription('賭け金')
      .setRequired(true)
  );

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function execute(interaction) {
  const bet = interaction.options.getInteger('bet');
  const client = interaction.client;
  const userId = interaction.user.id;
  let points = client.getCoins(userId) || 0;

  if (bet < 100) return interaction.reply({ content: "❌ 最低賭け金は100コインです！", flags: 64 });
  if (bet * 1.5 > points) return interaction.reply({ content: "❌ コインが足りません！", flags: 64 });

  await interaction.deferReply(); // 初回応答待機

  // 確定結果を先に決める
  const finalResult = Array.from({ length: 3 }, () => symbols[Math.floor(Math.random() * symbols.length)]);

  let display = ['❔', '❔', '❔'];
  const msg = await interaction.editReply({ content: `🎰 ${display.join(' ')}\n回転中…` });

  for (let round = 0; round < 5; round++) {
    display = display.map((s, i) => round === 4 ? finalResult[i] : symbols[Math.floor(Math.random() * symbols.length)]);
    await sleep(500);
    await msg.edit({ content: `🎰 ${display.join(' ')}\n回転中…` });
  }

  let outcome = "";
  if (finalResult.every(v => v === finalResult[0])) {
    const win = bigJackpot[finalResult[0]] + Math.ceil(bet * 0.4 + bet);
    client.updateCoins(userId, win);
    outcome = `🎉 大当たり！ ${win}コイン獲得！`;
  } else if (new Set(finalResult).size === 2) {
    const matchSymbol = finalResult.find(s => finalResult.filter(v => v === s).length === 2);
    const win = smallJackpot[matchSymbol] + Math.ceil(bet * 0.2 + bet);
    client.updateCoins(userId, win);
    outcome = `✨ 小当たり！ ${win}コイン獲得！`;
  } else {
    client.updateCoins(userId, -bet * 1.5);
    outcome = `💔 ハズレ… ${bet}コイン失いました。`;
  }

  points = client.getCoins(userId);

  await interaction.editReply({
    content: `🎰 ${finalResult.join(' ')}\n${outcome}\n現在のコイン: ${points}`
  });
}
