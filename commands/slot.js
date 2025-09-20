import { SlashCommandBuilder } from 'discord.js';

const symbols = ["🍒", "🍋", "🍊", "💎", "7️⃣"];

const bigJackpot = {
  "🍒": 250,
  "🍋": 250,
  "🍊": 400,
  "💎": 500,
  "7️⃣": 750
};

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

export async function execute(interaction, client) {
  const bet = interaction.options.getInteger('bet');
  const userId = interaction.user.id;

  let points = client.getCoins(userId) || 0;

  if (bet <= 0) {
    await interaction.reply({ content: "❌ 正しい賭け金を入力してください！", ephemeral: true });
    return;
  }
  if (bet > points) {
    await interaction.reply({ content: "❌ コインが足りません！", ephemeral: true });
    return;
  }

  // 確定結果を先に決めておく
  const finalResult = [
    symbols[Math.floor(Math.random()*symbols.length)],
    symbols[Math.floor(Math.random()*symbols.length)],
    symbols[Math.floor(Math.random()*symbols.length)]
  ];

  // 初期メッセージ
  let display = ['❔', '❔', '❔'];
  const msg = await interaction.reply({ content: `🎰 ${display.join(' ')}\n回転中…`, fetchReply: true });

  // 5回繰り返す回転アニメーション
  for (let round = 0; round < 5; round++) {
    for (let i = 0; i < 3; i++) {
      // 確定結果になる最後の回以外はランダム表示
      if (round === 4) {
        display[i] = finalResult[i];
      } else {
        display[i] = symbols[Math.floor(Math.random()*symbols.length)];
      }
    }
    await sleep(500);
    await msg.edit({ content: `🎰 ${display.join(' ')}\n回転中…` });
  }

  // 当たり判定
  let outcome = "";
  if (finalResult[0] === finalResult[1] && finalResult[1] === finalResult[2]) {
    const base = bigJackpot[finalResult[0]];
    const win = base + Math.ceil(bet * 0.4);
    client.updateCoins(userId, win);
    outcome = `🎉 大当たり！ ${win}コイン獲得！`;
  } else if (finalResult[0] === finalResult[1] || finalResult[1] === finalResult[2] || finalResult[0] === finalResult[2]) {
    const matchSymbol = finalResult[0] === finalResult[1] ? finalResult[0] :
                        finalResult[1] === finalResult[2] ? finalResult[1] : finalResult[0];
    const base = smallJackpot[matchSymbol];
    const win = base + Math.ceil(bet * 0.2);
    client.updateCoins(userId, win);
    outcome = `✨ 小当たり！ ${win}コイン獲得！`;
  } else {
    client.updateCoins(userId, -bet);
    outcome = `💔 ハズレ… ${bet}コイン失いました。`;
  }

  points = client.getCoins(userId);

  // 最終結果
  await msg.edit({
    content: `🎰 ${finalResult.join(' ')}\n${outcome}\n現在のコイン: ${points}`
  });
}
