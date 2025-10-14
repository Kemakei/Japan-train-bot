import { SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const symbols = ["🍒", "🍋", "🍊", "💎", "7️⃣"];

// 金コインスロット（倍率控えめ版）
const bigJackpot = { "🍒": 50, "🍋": 50, "🍊": 80, "💎": 100, "7️⃣": 200 };
const smallJackpot = Object.fromEntries(
  Object.entries(bigJackpot).map(([k, v]) => [k, Math.ceil(v / 2)])
);

export const data = new SlashCommandBuilder()
  .setName('slot_vip')
  .setDescription('金コインを使ったスロット')
  .addIntegerOption(option =>
    option.setName('bet')
      .setDescription('ベットする金コインの数（最低1）')
      .setRequired(true)
  );

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// リール結果の生成
function pickResult() {
  const r = Math.random();
  if (r < 0.02) {
    // 大当たり 2%
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    return [symbol, symbol, symbol];
  } else if (r < 0.15) {
    // 小当たり 13%
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    let other;
    do { other = symbols[Math.floor(Math.random() * symbols.length)]; } while (other === symbol);
    const result = [symbol, symbol, other];
    return result.sort(() => Math.random() - 0.5);
  } else {
    // ハズレ 85%
    let res;
    do {
      res = Array.from({ length: 3 }, () => symbols[Math.floor(Math.random() * symbols.length)]);
    } while (new Set(res).size < 3);
    return res;
  }
}

export async function execute(interaction, { client }) {
  const bet = interaction.options.getInteger('bet');
  const userId = interaction.user.id;

  if (bet < 1) return interaction.reply({ content: "❌ 最低ベットは1金コインです！", flags: 64});

  const coinsCol = client.coinsCol;
  const userDoc = await coinsCol.findOne({ userId });
  const vipPoints = userDoc?.VIPCoins || 0;

  if (bet > vipPoints) return interaction.reply({ content: "❌ 金コインが足りません！", flags: 64});

  await interaction.deferReply();

  const finalResult = pickResult();
  let display = ['❔', '❔', '❔'];
  const msg = await interaction.editReply({ content: `🎰 ${display.join(' ')}\n回転中…` });

  for (let round = 0; round < 5; round++) {
    display = display.map((s, i) => round === 4 ? finalResult[i] : symbols[Math.floor(Math.random() * symbols.length)]);
    await sleep(500);
    await msg.edit({ content: `🎰 ${display.join(' ')}\n回転中…` });
  }

  let outcome = "";
  let change = 0;

  if (finalResult.every(v => v === finalResult[0])) {
    // 大当たり
    change = bigJackpot[finalResult[0]] * bet;
    outcome = `🎉 大当たり！ ${change} 金コイン獲得！`;
  } else if (new Set(finalResult).size === 2) {
    // 小当たり
    const matchSymbol = finalResult.find(s => finalResult.filter(v => v === s).length === 2);
    change = smallJackpot[matchSymbol] * bet;
    outcome = `✨ 小当たり！ ${change} 金コイン獲得！`;
  } else {
    // ハズレ：ベット額×2〜3倍の損失
    const multiplier = Math.floor(Math.random() * 2) + 2; // 2 or 3
    change = -bet * multiplier;
    outcome = `💔 ハズレ… ${-change} 金コイン失いました。`;
  }

  // 更新
  let newPoints = vipPoints + change;
  if (newPoints < 0) newPoints = 0; // マイナスなら0にリセット

  await coinsCol.updateOne(
    { userId },
    { $set: { VIPCoins: newPoints } },
    { upsert: true }
  );

  await interaction.editReply({
    content: `🎰 ${finalResult.join(' ')}\n${outcome}\n現在の金コイン: ${newPoints}`
  });
}
