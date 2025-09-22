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
      .setDescription('賭け金（最低100コイン）')
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

  // --- 最低掛け金と所持コインチェック ---
  if (bet < 100) return interaction.reply({ content: "❌ 最低賭け金は100コインです！", flags: 64 });
  if (bet * 1.5 > points) return interaction.reply({ content: "❌ コインが足りません！", flags: 64 });

  await interaction.deferReply();

  // 確定結果を先に決める
  const finalResult = Array.from({ length: 3 }, () => symbols[Math.floor(Math.random() * symbols.length)]);

  // 回転演出
  let display = ['❔', '❔', '❔'];
  const msg = await interaction.editReply({ content: `🎰 ${display.join(' ')}\n回転中…` });

  for (let round = 0; round < 5; round++) {
    display = display.map((s, i) => round === 4 ? finalResult[i] : symbols[Math.floor(Math.random() * symbols.length)]);
    await sleep(500);
    await msg.edit({ content: `🎰 ${display.join(' ')}\n回転中…` });
  }

  let outcome = "";
  let change = 0; // 実際に増減するコイン

  if (finalResult.every(v => v === finalResult[0])) {
    // 大当たり
    change = bigJackpot[finalResult[0]] + Math.ceil(bet * 1.4);
    client.updateCoins(userId, change);
    outcome = `🎉 大当たり！ ${change}コイン獲得！`;
  } else if (new Set(finalResult).size === 2) {
    // 小当たり
    const matchSymbol = finalResult.find(s => finalResult.filter(v => v === s).length === 2);
    change = smallJackpot[matchSymbol] + Math.ceil(bet * 1.2);
    client.updateCoins(userId, change);
    outcome = `✨ 小当たり！ ${change}コイン獲得！`;
  } else {
    // ハズレ
    change = Math.ceil(bet * 1.5);
    client.updateCoins(userId, -change);
    outcome = `💔 ハズレ… ${change}コイン失いました。`;
  }

  points = client.getCoins(userId);

  await interaction.editReply({
    content: `🎰 ${finalResult.join(' ')}\n${outcome}\n現在のコイン: ${points}`
  });
}
