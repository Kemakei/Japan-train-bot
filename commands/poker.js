import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
} from "discord.js";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pythonPath = path.resolve(__dirname, "../python/combine.py");
const pythonCmd = process.platform === "win32" ? "py" : "python3";

// =====================
// 役評価（そのまま維持）
// =====================
function evaluateHandStrength(hand) {
  const rankValue = { "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"T":10,"J":11,"Q":12,"K":13,"A":14 };
  const ranks = hand.map(c => c[0]);
  const suits = hand.map(c => c[1]);
  const values = ranks.map(r => rankValue[r]).sort((a,b)=>a-b);

  const isFlush = suits.every(s => s === suits[0]);
  const isStraight =
    values.every((v,i,a)=> i===0 || v === a[i-1]+1) ||
    values.toString() === "2,3,4,5,14";

  const counts = Object.values(
    ranks.reduce((acc,r)=>{acc[r]=(acc[r]||0)+1;return acc;},{})
  ).sort((a,b)=>b-a);

  if (isFlush && isStraight && values.includes(14) && values[0] === 10) return 9;
  if (isFlush && isStraight) return 8;
  if (counts[0] === 4) return 7;
  if (counts[0] === 3 && counts[1] === 2) return 6;
  if (isFlush) return 5;
  if (isStraight) return 4;
  if (counts[0] === 3) return 3;
  if (counts[0] === 2 && counts[1] === 2) return 2;
  if (counts[0] === 2) return 1;
  return 0;
}

// =====================
// 詳細比較（そのまま維持）
// =====================
function getDetailedHandScore(hand) {
  const rankValue = { "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"T":10,"J":11,"Q":12,"K":13,"A":14 };
  const ranks = hand.map(c => c[0]);
  const values = ranks.map(r => rankValue[r]).sort((a,b)=>b-a);

  const counts = {};
  for (const r of ranks) counts[r] = (counts[r]||0)+1;

  const groups = Object.entries(counts)
    .map(([r,c]) => [c, rankValue[r]])
    .sort((a,b)=> b[0]-a[0] || b[1]-a[1]);

  const handRank = evaluateHandStrength(hand);

  return {
    rank: handRank,
    scoreArr: groups.flatMap(g => [g[0], g[1]])
  };
}

function compareHandsDetailed(playerHand, botHand) {
  const p = getDetailedHandScore(playerHand);
  const b = getDetailedHandScore(botHand);

  if (p.rank !== b.rank) return p.rank > b.rank ? 1 : -1;

  for (let i=0;i<Math.max(p.scoreArr.length,b.scoreArr.length);i++){
    const pa = p.scoreArr[i]||0;
    const ba = b.scoreArr[i]||0;
    if (pa !== ba) return pa > ba ? 1 : -1;
  }
  return 0;
}

// =====================
// Bot（再抽選削除・軽量化のみ）
// =====================
function drawBotHand(deck, bet) {
  // 完全ランダム（イカサマ削除）
  const hand = deck.splice(0,5);

  // 少しだけ強さ補正（壊れない程度）
  if (bet > 1000000 && Math.random() < 0.15) {
    hand.sort((a,b)=>b[0].localeCompare(a[0]));
  }

  return hand;
}

// =====================
// ゲーム管理
// =====================
const ongoingGames = new Map();

// =====================
// コマンド
// =====================
export const data = new SlashCommandBuilder()
  .setName("poker")
  .setDescription("Botとポーカーで勝負");

export async function execute(interaction) {

  const client = interaction.client;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;
  const gameKey = `${channelId}-${userId}`;

  if (ongoingGames.has(gameKey)) {
    return interaction.reply({ content: "❌ 進行中あり", flags: 64 });
  }

  const bet = 1000;
  const coins = await client.getCoins(userId);

  if (coins < bet) {
    return interaction.reply({ content: "❌ コイン不足", flags: 64 });
  }

  await interaction.deferReply();
  await client.updateCoins(userId, -bet);

  // =====================
  // デッキ
  // =====================
  const suits = ["S","H","D","C"];
  const ranks = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];

  const deck = [];
  for (const r of ranks) for (const s of suits) deck.push(r+s);
  deck.sort(()=>Math.random()-0.5);

  const playerHand = deck.splice(0,5);
  const botHand = drawBotHand(deck, bet);

  const gameState = {
    playerHand,
    botHand,
    bet,
    playerBet: bet,
    requiredBet: bet,
    finalized: false,
    gameKey
  };

  ongoingGames.set(gameKey, gameState);

  const combinedPath = path.resolve(__dirname, `../python/images/${userId}_${Date.now()}.png`);

  await generateImage(gameState, combinedPath);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${gameKey}:call`).setLabel("コール").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${gameKey}:fold`).setLabel("フォールド").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`${gameKey}:bet1000`).setLabel("+1000").setStyle(ButtonStyle.Primary),
  );

  const file = new AttachmentBuilder(combinedPath);

  await interaction.editReply({
    content: `あなたの手札`,
    files: [file],
    components: [row],
  });

  const collector = interaction.channel.createMessageComponentCollector({
    filter: i => i.user.id === userId && i.customId.startsWith(gameKey),
    time: 60000
  });

  async function endGame(reason, forced) {
    if (gameState.finalized) return;
    gameState.finalized = true;
    collector.stop(reason);
    await finalize(gameState, client, combinedPath, interaction, forced);
    ongoingGames.delete(gameKey);
  }

  collector.on("collect", async i => {

    const [, action] = i.customId.split(":");

    // =====================
    // fold（悪用修正）
    // =====================
    if (action === "fold") {
      await i.update({ content: "フォールド", components: [] });

      // ❗ Botフォールドでも利益なし
      return endGame("fold", "bot");
    }

    // =====================
    // call
    // =====================
    if (action === "call") {
      await i.update({ content: "コール", components: [] });
      return endGame("showdown");
    }

    // =====================
    // bet
    // =====================
    if (action === "bet1000") {
      const coins = await client.getCoins(userId);
      if (coins < 1000) return i.reply({ content:"不足", flags:64 });

      gameState.playerBet += 1000;
      gameState.requiredBet = gameState.playerBet;

      await client.updateCoins(userId, -1000);
      await i.update({ content:"ベット+1000", components:[row] });
    }
  });
}

// =====================
// 勝敗処理（フォールド悪用修正）
// =====================
async function finalize(gameState, client, filePath, interaction, forced) {

  const userId = interaction.user.id;

  const winner =
    forced === "bot"
      ? "bot"
      : compareHandsDetailed(gameState.playerHand, gameState.botHand) > 0
      ? "player"
      : "bot";

  let msg = "";

  // =====================
  // 勝ち
  // =====================
  if (winner === "player") {
    const win = gameState.playerBet * 2;
    await client.updateCoins(userId, win);
    msg = `勝ち +${win}`;

  } else {
    msg = `負け`;
  }

  const file = new AttachmentBuilder(filePath);

  await interaction.editReply({
    content: msg + `\nBot: ${gameState.botHand.join(" ")}`,
    files: [file],
    components: []
  });

  setTimeout(()=>{ try{fs.unlinkSync(filePath);}catch{} }, 5000);
}

// =====================
// 画像生成（そのまま維持）
// =====================
async function generateImage(gameState, pathOut) {

  return new Promise((resolve, reject) => {

    const args = [
      ...gameState.playerHand,
      ...gameState.botHand,
      "0",
      pathOut
    ];

    const proc = spawn(pythonCmd, [pythonPath, ...args]);

    proc.on("close", code => {
      if (code === 0) resolve();
      else reject();
    });

  });
}