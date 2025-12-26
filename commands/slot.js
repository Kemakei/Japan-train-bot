import { SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

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

function pickResult(jobName = '無職') {
  // 基本確率
  let bigRate = 0.05;
  let smallRate = 0.20;

  // ギャンブラーなら当たりやすくする
  if (jobName === 'ギャンブラー') {
    bigRate += 0.05;   // 大当たり 10%
    smallRate += 0.15; // 小当たり 45%
  }

  const r = Math.random();
  if (r < bigRate) {
    // 大当たり
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    return [symbol, symbol, symbol];
  } else if (r < bigRate + smallRate) {
    // 小当たり
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    let other;
    do { other = symbols[Math.floor(Math.random() * symbols.length)]; } while (other === symbol);
    const result = [symbol, symbol, other];
    return result.sort(() => Math.random() - 0.5);
  } else {
    // ハズレ
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

  if (bet < 100) return interaction.reply({ content: "❌ 最低賭け金は100コインです！", flags: 64 });

  const coinsCol = client.coinsCol;
  const userDoc = await coinsCol.findOne({ userId });
  const points = userDoc?.coins || 0;

  if (bet > points) return interaction.reply({ content: "❌ コインが足りません！", flags: 64 });

  await interaction.deferReply();

  // ユーザー職業取得
  const jobDoc = await client.db.collection("jobs").findOne({ userId });
  const jobName = jobDoc?.job || '無職';

  const finalResult = pickResult(jobName);

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
    change = bigJackpot[finalResult[0]] + Math.ceil(bet * 1.4);
    outcome = `🎉 大当たり！ ${change}コイン獲得！`;
  } else if (new Set(finalResult).size === 2) {
    const matchSymbol = finalResult.find(s => finalResult.filter(v => v === s).length === 2);
    change = smallJackpot[matchSymbol] + Math.ceil(bet * 1.2);
    outcome = `✨ 小当たり！ ${change}コイン獲得！`;
  } else {
    change = Math.ceil(bet * 1.5);
    change = -change;
    outcome = `ハズレ… ${-change}コイン失いました。`;
  }

  await coinsCol.updateOne(
    { userId },
    { $inc: { coins: change } },
    { upsert: true }
  );

  const updatedDoc = await coinsCol.findOne({ userId });
  const updatedPoints = updatedDoc?.coins || 0;

  await interaction.editReply({
    content: `🎰 ${finalResult.join(' ')}\n${outcome}\n現在のコイン: ${updatedPoints}`
  });
}
