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

const ongoingGames = new Map();

export const data = new SlashCommandBuilder()
  .setName("poker_vip")
  .setDescription("金コインでBotとポーカー対戦");

export async function execute(interaction) {
  const client = interaction.client;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;
  const gameKey = `${channelId}-${userId}`;

  if (ongoingGames.has(gameKey)) {
    console.log(`[poker_vip] ${gameKey} already playing`);
    return interaction.reply({ content: "❌ このチャンネルで進行中のゲームがあります！", ephemeral: true });
  }

  // VIP の bet (元の VIP は 1)
  const bet = 1;
  const initialCoins = await client.getCoins(userId);
  if (initialCoins < bet) return interaction.reply({ content: "❌ 金コインが足りません！", flags: 64 });

  await interaction.deferReply();
  await client.updateCoins(userId, -bet);

  // --- 役評価（キッカーなし） ---
  function evaluateHandStrength(hand) {
    const rankValue = { "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"T":10,"J":11,"Q":12,"K":13,"A":14 };
    const ranks = hand.map(c => c[0]);
    const suits = hand.map(c => c[1]);
    const values = ranks.map(r => rankValue[r]).sort((a,b)=>a-b);
    const isFlush = suits.every(s => s === suits[0]);
    const isStraight = values.every((v,i,a)=> i===0 || v === a[i-1]+1) || (values.toString()==="2,3,4,5,14");
    const counts = Object.values(ranks.reduce((acc,r)=>{ acc[r]=(acc[r]||0)+1; return acc; },{})).sort((a,b)=>b-a);
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

  // --- Bot手札生成 ---
  function drawBotHand(deck, bet) {
    const maxBet = 100_000;
    const strengthMultiplier = 1 + (Math.min(bet, maxBet) / maxBet) * (30 - 1);
    const trials = Math.floor(10 + 100 * Math.min(1, strengthMultiplier / 30));
    const biasFactor = Math.min(1, Math.log10(bet + 1) / 5);
    const biasRanks = ["T","J","Q","K","A"];
    const biasedDeck = deck.slice().sort((a,b)=>{
      const ra = biasRanks.includes(a[0]) ? -biasFactor : 0;
      const rb = biasRanks.includes(b[0]) ? -biasFactor : 0;
      return ra - rb + (Math.random()-0.5)*0.1;
    });

    let bestHand = null;
    let bestScore = -Infinity;
    for (let i=0;i<trials;i++){
      const t = [...biasedDeck];
      const hand = t.splice(0,5);
      const score = evaluateHandStrength(hand) * strengthMultiplier;
      if (score > bestScore){ bestScore = score; bestHand = hand; }
    }
    for (const c of bestHand){
      const idx = deck.indexOf(c);
      if (idx !== -1) deck.splice(idx,1);
    }
    return bestHand;
  }

  // デッキ作成（公開進行は poker_vip の仕様: 3,3,5）
  const suits = ["S","H","D","C"];
  const ranks = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const deck = [];
  for (const r of ranks) for (const s of suits) deck.push(r+s);
  deck.sort(()=>Math.random()-0.5);

  const playerHand = deck.splice(0,5);
  const botHand = drawBotHand(deck, bet);

  const timestamp = Date.now();
  const combinedPath = path.resolve(__dirname, `../python/images/poker_vip_${userId}_${timestamp}.png`);

  const gameState = {
    turn: 0, // 0..2, reveal pattern 3,3,5
    playerHand,
    botHand,
    deck,
    bet,
    playerBet: bet,
    requiredBet: bet,
    active: true,
    finalized: false,
    gameKey
  };

  ongoingGames.set(gameKey, gameState);

  // 初期画像（flop 3枚）
  await generateImage(gameState, 3, combinedPath);

  const mkId = id => `${gameKey}:${id}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(mkId("call")).setLabel("コール").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(mkId("fold")).setLabel("フォールド").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(mkId("bet1")).setLabel("ベット +1").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(mkId("bet10")).setLabel("ベット +10").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(mkId("customBet")).setLabel("💬 ベット指定").setStyle(ButtonStyle.Secondary)
  );

  const file = new AttachmentBuilder(combinedPath);
  await interaction.editReply({
    content: `🎲 あなたの手札です。現在のベット: ${gameState.playerBet} 金コイン`,
    files: [file],
    components: [row]
  });

  const filter = i => i.user.id === userId && i.customId?.startsWith(gameKey + ":");
  const collector = interaction.channel.createMessageComponentCollector({ filter, time: 90000 });

  async function endGameCleanup(reason, forcedWinner = null) {
    if (gameState.finalized) return;
    try { if (!collector.ended) collector.stop(reason || "completed"); } catch(e){ console.error(e); }
    try { await finalizeGame(gameState, client, combinedPath, interaction, forcedWinner); } catch(e){ console.error(e); }
    finally { ongoingGames.delete(gameKey); }
  }

  collector.on("collect", async btnInt => {
    try {
      const [,action] = btnInt.customId.split(":");
      const userCoins = await client.getCoins(userId);

      if (action === "fold") {
        await btnInt.update({ content: "🫱 あなたはフォールドしました。🤖 の勝ちです！", components: [] });
        await endGameCleanup("folded", "bot");
        return;
      }

      if (action?.startsWith("bet") && action !== "customBet") {
        const add = action === "bet1" ? 1 : 10;
        if (add > userCoins) return btnInt.reply({ content: "❌ 金コインが足りません！", flags: 64 });
        gameState.playerBet += add;
        gameState.requiredBet = Math.max(gameState.requiredBet, gameState.playerBet);
        await client.updateCoins(userId, -add);
        await btnInt.update({ content:`🎲 あなたの手札です。現在のベット: ${gameState.playerBet} 金コイン`, files:[new AttachmentBuilder(combinedPath)], components:[row] });
        console.log(`[poker_vip] ${gameKey} player bet +${add} -> ${gameState.playerBet}`);
        return;
      }

      if (action === "customBet") {
        const modal = new ModalBuilder().setCustomId(mkId("customBetModal")).setTitle("ベット金額を入力");
        const input = new TextInputBuilder().setCustomId("betAmount").setLabel("ベット金額（整数）").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await btnInt.showModal(modal);
        const submitted = await btnInt.awaitModalSubmit({ time: 30000 }).catch(()=>null);
        if(!submitted) return;
        const betValue = Number(submitted.fields.getTextInputValue("betAmount"));
        if (isNaN(betValue) || betValue <= 0) return submitted.reply({ content: "❌ 無効な金額です", flags: 64 });
        if (betValue > userCoins) return submitted.reply({ content: "❌ 金コインが足りません！", flags: 64 });
        gameState.playerBet += betValue;
        gameState.requiredBet = Math.max(gameState.requiredBet, gameState.playerBet);
        await client.updateCoins(userId, -betValue);
        await submitted.reply({ content: `💰 ${betValue} 金コインを追加しました（合計ベット: ${gameState.playerBet}）`, flags: 64 });
        await interaction.editReply({ content:`🎲 あなたの手札です。現在のベット: ${gameState.playerBet} 金コイン`, files:[new AttachmentBuilder(combinedPath)], components:[row] });
        return;
      }

      if (action === "call") {
        const callAmount = gameState.requiredBet - gameState.playerBet;
        if (callAmount > 0) {
          if (callAmount > userCoins) return btnInt.reply({ content: "❌ 金コインが足りません！", flags: 64 });
          gameState.playerBet += callAmount;
          await client.updateCoins(userId, -callAmount);
        }

        // フロー: プレイヤー→Bot→プレイヤー→Bot→プレイヤー→勝敗（3,3,5）。ただし3ターン目はBot応答なし。
        // 現在の turn が 0 or 1 -> Bot の応答（raise/call）を行い、次の stage に移る。
        // もし turn === 2 (最後の自分の行動) ならショーダウン。
        if (gameState.turn >= 2) {
          // 最終ターン（プレイヤーの行動のみ）→ ショーダウン
          await btnInt.update({ content: "🔍 ショーダウン！ 判定しています...", components: [] });
          await endGameCleanup("completed");
          return;
        } else {
          // Bot の応答があり、その後次ターンのカードを公開してプレイヤーに返る
          await btnInt.update({ content: "✅ コールしました！", files:[new AttachmentBuilder(combinedPath)], components: [row] });
          await botTurn(gameState, client, interaction, combinedPath);
          return;
        }
      }

    } catch (err) {
      console.error("[poker_vip] error:", err);
      ongoingGames.delete(gameKey);
      try { if (!btnInt.replied) await btnInt.reply({ content: "❌ エラーが発生しました", flags: 64 }); } catch {}
    }
  });

  collector.on("end", async (_, reason) => {
    console.log(`[poker_vip] ${gameKey} collector end: ${reason}`);
    ongoingGames.delete(gameKey);
    if (reason === "time") {
      await client.updateCoins(userId, gameState.playerBet);
      await interaction.editReply({ content: `⌛ タイムアウト。ベットを返却しました。`, components: [] });
    }
  });
}

// --- Bot ターン（VIP: 2回まで応答。3ターン目は応答しない） ---
async function botTurn(gameState, client, interaction, combinedPath) {
  if (gameState.finalized) return;

  // Bot 思考強度スコア化（役ランクベース + ランダム）
  const rank = evaluateHandStrength(gameState.botHand);
  const score = rank + Math.random() * 0.6;
  console.log(`[poker_vip] Bot score=${score.toFixed(2)} rank=${rank} turn=${gameState.turn}`);

  // レイズ判定（より強いほどレイズしやすい）
  const raiseProb = 0.15 + 0.5 * (rank / 9);
  const rnd = Math.random();
  let decision = "call";
  if (rnd < raiseProb) decision = "raise";

  // レイズ金額は VIP の文脈に合わせて natural に計算
  function calcRaise(currentRequired, strength) {
    if (currentRequired <= 1) return 1 + Math.floor(Math.random() * 2);
    const minR = Math.max(1, Math.floor(currentRequired * 0.05 * (1 + strength)));
    const maxR = Math.max(minR + 1, Math.floor(currentRequired * 0.12 * (1 + strength)));
    return Math.floor(minR + Math.random() * (maxR - minR + 1));
  }

  if (decision === "raise") {
    const raiseAmount = calcRaise(gameState.requiredBet, score);
    gameState.requiredBet += raiseAmount;
    console.log(`[poker_vip] Bot raise +${raiseAmount} -> required=${gameState.requiredBet}`);
    await interaction.followUp({ content: `🤖 はレイズしました！ (+${raiseAmount} 金コイン)` });
  } else {
    await interaction.followUp({ content: "🤖 はコールしました。" });
  }

  // 次ターン（reveal pattern 3,3,5） を進める（increment turn then generate image）
  const revealPattern = [3,3,5];
  const revealCount = revealPattern[Math.min(gameState.turn, revealPattern.length - 1)];
  gameState.turn++;
  await generateImage(gameState, revealCount, combinedPath);
  const file = new AttachmentBuilder(combinedPath);

  // UI 更新：プレイヤーに戻る（ただし3ターン目のBot応答は行わないように呼び出し箇所で調整）
  const mkRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${gameState.gameKey}:call`).setLabel("コール").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${gameState.gameKey}:fold`).setLabel("フォールド").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`${gameState.gameKey}:bet1`).setLabel("ベット +1").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${gameState.gameKey}:bet10`).setLabel("ベット +10").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${gameState.gameKey}:customBet`).setLabel("💬 ベット指定").setStyle(ButtonStyle.Secondary)
  );

  await interaction.editReply({
    content: `🃏 ターン${gameState.turn} 終了。現在のベット: ${gameState.playerBet} 金コイン`,
    files: [file],
    components: gameState.turn < 3 ? [mkRow] : []
  });
}

// --- VIP 側の報酬ロジック（元のpoker_vipを維持） ---
function botStrength77to200(normStrength) {
  return Math.round(77 + normStrength * (200 - 77));
}
function calculatePlayerReward(baseBet, botStrength) {
  const norm = (botStrength - 77) / (200 - 77);
  return Math.round(baseBet * (2 + norm * (5 - 2)));
}

async function finalizeGame(gameState, client, combinedPath, interaction, forcedWinner = null) {
  if (gameState.finalized) return;
  gameState.finalized = true;

  const userId = interaction.user.id;
  let winner = forcedWinner;
  const pScore = evaluateHandStrength(gameState.playerHand);
  const bScore = evaluateHandStrength(gameState.botHand);

  if (!winner) {
    winner = pScore > bScore ? "player" : bScore > pScore ? "bot" : "draw";
  }

  const baseBet = Math.max(1, gameState.playerBet || 1);
  const botStrength = botStrength77to200(evaluateHandStrength(gameState.botHand));
  let msg = "";

  if (winner === "player") {
    const playerChange = calculatePlayerReward(baseBet, botStrength);
    await client.updateCoins(userId, playerChange);
    msg = `🎉 勝ち！ +${playerChange} 金コイン（Bot強さ×${botStrength}）`;
  } else if (winner === "bot") {
    const playerChange = -baseBet * 3;
    await client.updateCoins(userId, playerChange);
    const current = await client.getCoins(userId);
    if (current < 0) await client.setCoins(userId, 0);
    msg = `💀 負け！ -${-playerChange} 金コイン`;
  } else {
    const refund = Math.floor(baseBet / 2);
    await client.updateCoins(userId, refund);
    msg = `🤝 引き分け！ +${refund} 金コイン返却`;
  }

  await generateImage(gameState, 5, combinedPath);
  const file = new AttachmentBuilder(combinedPath);
  const currentCoins = await client.getCoins(userId);

  await interaction.editReply({
    content: `${msg}\n🂡 あなたの強さ: ${pScore}\n🤖 Bot手札: ${gameState.botHand.join(" ")}\n現在の金コイン: ${currentCoins}`,
    files: [file],
    components: []
  });

  setTimeout(() => { try { fs.unlinkSync(combinedPath); } catch {} }, 5000);
}

// --- 画像生成（shared） ---
async function generateImage(gameState, revealCount, combinedPath) {
  const isRevealAll = revealCount >= 5;
  // ここは combine.py の期待引数に合わせて変更してください（現在は手札配列を各カード引数で渡す仕様）
  const args = [pythonPath, ...gameState.playerHand, ...gameState.botHand, isRevealAll ? "1" : "0", combinedPath];

  return new Promise((resolve, reject) => {
    console.log("[poker_vip] generateImage args:", args.slice(0,6));
    const proc = spawn(pythonCmd, args);
    let err = "";
    proc.stdout.on("data", d => console.log("[python stdout]", d.toString()));
    proc.stderr.on("data", d => { err += d.toString(); console.error("[python stderr]", d.toString()); });
    proc.on("error", e => { console.error("[poker_vip] spawn error:", e); reject(e); });
    proc.on("close", code => { if (code === 0) resolve(); else reject(new Error(err || `Python exited ${code}`)); });
  });
}
