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

  // --- 役評価 (キッカーなし) ---
  function evaluateHandStrength(hand) {
    const rankValue = { "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"T":10,"J":11,"Q":12,"K":13,"A":14 };
    const ranks = hand.map(c => c[0]);
    const suits = hand.map(c => c[1]);
    const values = ranks.map(r => rankValue[r]).sort((a,b)=>a-b);

    const isFlush = suits.every(s => s === suits[0]);
    const isStraight = values.every((v,i,a)=> i===0 || v === a[i-1]+1) || (values.toString() === "2,3,4,5,14");
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

  function getDetailedHandScore(hand) {
  const rankValue = { "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"T":10,"J":11,"Q":12,"K":13,"A":14 };
  const ranks = hand.map(c => c[0]);
  const values = ranks.map(r => rankValue[r]).sort((a,b)=>b-a);
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r]||0)+1;

  // グループごとに [count, value] の配列を作り、降順にソート
  const groups = Object.entries(counts)
    .map(([r,c]) => [c, rankValue[r]])
    .sort((a,b)=> b[0]-a[0] || b[1]-a[1]);

  const handRank = evaluateHandStrength(hand);
  const tieBreaker = groups.flatMap(g => [g[0], g[1]]); // flatten for comparison
  return { rank: handRank, scoreArr: tieBreaker };
  }

  function compareHandsDetailed(playerHand, botHand) {
    const p = getDetailedHandScore(playerHand);
    const b = getDetailedHandScore(botHand);

    if (p.rank !== b.rank) return p.rank > b.rank ? 1 : -1;

    // ランクが同じならグループ値で比較（ペアの高さなど）
    for (let i=0; i<Math.max(p.scoreArr.length, b.scoreArr.length); i++) {
      const pa = p.scoreArr[i] || 0;
      const ba = b.scoreArr[i] || 0;
      if (pa !== ba) return pa > ba ? 1 : -1;
    }
    return 0; // 完全に同じ
  }

// マルチゲーム対応：gameKey -> gameState
const ongoingGames = new Map();

export const data = new SlashCommandBuilder()
  .setName("poker")
  .setDescription("Botとポーカーで勝負");

export async function execute(interaction) {
  const client = interaction.client;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;
  const gameKey = `${channelId}-${userId}`;

  if (ongoingGames.has(gameKey)) {
    return interaction.reply({ content: "❌ このチャンネルであなたの進行中ゲームがあります！", flags: 64 });
  }

  // 初期ベット（元のpoker.jsは1000を使っていた）
  const bet = 1000;
  const initialCoins = await client.getCoins(userId);
  if (initialCoins < bet) {
    return interaction.reply({ content: "❌ コインが足りません！", flags: 64 });
  }

  // ゲーム開始
  await interaction.deferReply();
  await client.updateCoins(userId, -bet);

  // --- Bot手札生成（poker.js方式） ---
  function drawBotHand(deck, bet) {
    const minBet = 1000;
    const maxBet = 10_000_000_000_000; // 10兆
    const strengthMultiplier = Math.min(100, 1 + 99 * (bet - minBet) / (maxBet - minBet));

    // 強さに応じて試行回数とバイアスを調整
    const trials = Math.floor(5 + strengthMultiplier * 2); // 強さ1→7回, 強さ100→205回
    const biasFactor = Math.min(1.0, 0.01 * strengthMultiplier); // 強さ100で最大1.0
    const biasRanks = ["T","J","Q","K","A"];

    // 高ランクカードを優先してデッキを並び替え
    const biasedDeck = deck.slice().sort((a,b)=>{
      const ra = biasRanks.includes(a[0]) ? -biasFactor : 0;
      const rb = biasRanks.includes(b[0]) ? -biasFactor : 0;
      return ra - rb + (Math.random()-0.5)*0.2;
    });

    // 複数候補から最強を選ぶ
    let bestHand = null;
    let bestScore = -Infinity;
    for (let i = 0; i < trials; i++) {
      const temp = [...biasedDeck];
      const hand = temp.splice(0,5);
      const score = evaluateHandStrength(hand) + Math.random() * 0.05;
      if (score > bestScore) {
        bestScore = score;
        bestHand = hand;
      }
    }

    // 使用したカードをデッキから除外
    for (const c of bestHand) {
      const idx = deck.indexOf(c);
      if (idx !== -1) deck.splice(idx,1);
    }

    return bestHand;
  }


  // --- デッキ生成（カード公開進行は poker_vip と統一: 3,3,5） ---
  const suits = ["S","H","D","C"];
  const ranks = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const deck = [];
  for (const r of ranks) for (const s of suits) deck.push(r+s);
  deck.sort(()=>Math.random()-0.5);

  const playerHand = deck.splice(0,5);
  const botHand = drawBotHand(deck, bet);

  const timestamp = Date.now();
  const combinedPath = path.resolve(__dirname, `../python/images/combined_${userId}_${timestamp}.png`);

  const gameState = {
    turn: 0, // 0..2
    playerHand,
    botHand,
    deck,
    bet,
    playerBet: bet,
    requiredBet: bet,
    finalized: false,
    gameKey
  };

  // マップに保存してマルチサポート
  ongoingGames.set(gameKey, gameState);

  // 先に画像生成（フロップ3枚表示）
  await generateImage(gameState, 3, combinedPath);

  const mkId = id => `${gameKey}:${id}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(mkId("call")).setLabel("コール").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(mkId("fold")).setLabel("フォールド").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(mkId("bet1000")).setLabel("ベット +1000").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(mkId("bet10000")).setLabel("ベット +10000").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(mkId("customBet")).setLabel("💬 ベット指定").setStyle(ButtonStyle.Secondary)
  );

  const file = new AttachmentBuilder(combinedPath);
  await interaction.editReply({
    content: `🎲 あなたの手札です。現在のベット: ${gameState.playerBet} コイン`,
    files: [file],
    components: [row],
  });

  const filter = i => i.user.id === userId && i.customId?.startsWith(gameKey + ":");
  const collector = interaction.channel.createMessageComponentCollector({ filter, time: 90000 });

  async function stopAndFinalize(reason, forcedWinner = null){
    if (gameState.finalized) return;
    try { if (!collector.ended) collector.stop(reason || "completed"); } catch(e){ console.error(e); }
    try { await finalizeGame(gameState, client, combinedPath, interaction, forcedWinner); } catch(e){ console.error(e); }
    finally { ongoingGames.delete(gameKey); }
  }

  collector.on("collect", async (btnInt) => {
    try {
      if (gameState.finalized) return btnInt.reply({ content: "このゲームは既に終了しています。", flags: 64 });

      const [, action] = btnInt.customId.split(":");
      const userCoins = await client.getCoins(userId);

      // 固定ベット
      if (action && action.startsWith("bet") && action !== "customBet") {
        const add = action === "bet1000" ? 1000 : 10000;
        if (add > userCoins) return btnInt.reply({ content: "❌ コインが足りません！", flags: 64 });

        gameState.playerBet += add;
        gameState.requiredBet = Math.max(gameState.requiredBet, gameState.playerBet);
        await client.updateCoins(userId, -add);

        await btnInt.update({
          content: `🎲 あなたの手札です。現在のベット: ${gameState.playerBet} コイン`,
          files: [new AttachmentBuilder(combinedPath)],
          components: [row]
        });
        return;
      }

      // カスタムベットモーダル
      if (action === "customBet") {
        const modal = new ModalBuilder().setCustomId(mkId("customBetModal")).setTitle("ベット金額を入力");
        const input = new TextInputBuilder().setCustomId("betAmount").setLabel("ベット金額（整数）").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await btnInt.showModal(modal);

        const submitted = await btnInt.awaitModalSubmit({ time: 30000 }).catch(()=>null);
        if (!submitted) return;

        const betValue = Number(submitted.fields.getTextInputValue("betAmount"));
        if (isNaN(betValue) || betValue <= 0) return submitted.reply({ content: "❌ 無効な金額です", flags: 64 });
        if (betValue > userCoins) return submitted.reply({ content: "❌ コインが足りません！", flags: 64 });

        gameState.playerBet += betValue;
        gameState.requiredBet = Math.max(gameState.requiredBet, gameState.playerBet);
        await client.updateCoins(userId, -betValue);

        await interaction.editReply({
          content: `🎲 あなたの手札です。現在のベット: ${gameState.playerBet} コイン`,
          files: [new AttachmentBuilder(combinedPath)],
          components: [row]
        });

        await submitted.reply({ content: `💰 ${betValue} コインを追加しました（合計ベット: ${gameState.playerBet}）`, flags: 64 });
        return;
      }

      // フォールド
      if (action === "fold") {
        await btnInt.update({ content: "🫱 あなたはフォールドしました。🤖 の勝ちです！", components: [] });
        await stopAndFinalize("folded", "bot");
        return;
      }

      // コール
      if (action === "call") {
        const callAmount = gameState.requiredBet - gameState.playerBet;
        if (callAmount > 0) {
          if (callAmount > userCoins) return btnInt.reply({ content: "❌ コインが足りません！", flags: 64 });
          await client.updateCoins(userId, -callAmount);
          gameState.playerBet += callAmount;
        }

        
      if (gameState.turn >= 2) {
          await btnInt.update({ content: "🔍 ショーダウン！ 判定しています...", components: [] });
          await stopAndFinalize("completed"); 
          return;
        } else {
          await btnInt.update({ content: "✅ コールしました！", files:[new AttachmentBuilder(combinedPath)], components: [row] });
          await botTurn(gameState, client, interaction, combinedPath, row);
          return;
        }
      }

    } catch (err) {
      console.error("[poker] 例外:", err);
      ongoingGames.delete(gameKey);
      try { if (!btnInt.replied) await btnInt.reply({ content: "❌ エラーが発生しました", flags: 64 }); } catch {}
    }
  });

  collector.on("end", async (_, reason) => {
    ongoingGames.delete(gameKey);

    if (reason === "completed") {
      await finalizeGame(gameState, client, combinedPath, interaction);
    } else if (reason === "time") {
      if (!gameState.finalized) {
      await finalizeGame(gameState, client, combinedPath, interaction);
    }
    }
  });

}

// --- 修正版 botTurn ---
async function botTurn(gameState, client, interaction, combinedPath, row) {
  if (gameState.finalized) return;

  if (gameState.turn >= 2) {
    await finalizeGame(gameState, client, combinedPath, interaction);
    return;
  }

  const handRank = evaluateHandStrength(gameState.botHand);
  const botScore = handRank + Math.random() * 0.5; 

  const raiseProb = 0.1 + 0.25 * (handRank / 9) + 0.15 * Math.random();
  const callProb = 0.5 + 0.2 * (handRank / 9);
  const rnd = Math.random();

  let decision = "call";
  if (rnd < raiseProb) decision = "raise";
  else if (rnd < raiseProb + (1 - raiseProb) * (1 - callProb)) decision = "call";

  function calcRaiseAmount(requiredBet, strength) {
    const base = Math.max(1000, Math.floor(requiredBet * (0.3 + 0.5 * (strength / 10))));
    const added = Math.floor(Math.random() * Math.max(1, base));
    return base + added;
  }

  if (decision === "raise") {
    const raiseAmount = calcRaiseAmount(gameState.requiredBet, botScore);
    gameState.requiredBet += raiseAmount;
    await interaction.followUp({ content: `🤖 はレイズしました！ (+${raiseAmount} コイン)` });
  } else {
    await interaction.followUp({ content: `🤖 はコールしました。` });
  }

  const revealPattern = [3, 4, 5];
  const revealCount = revealPattern[Math.min(gameState.turn, revealPattern.length - 1)];
  gameState.turn++;

  await generateImage(gameState, revealCount, combinedPath);
  const file = new AttachmentBuilder(combinedPath);
  await interaction.editReply({
    content: `🃏 ターン${gameState.turn} 終了。現在のベット: ${gameState.playerBet} コイン`,
    files: [file],
    components: gameState.turn < 3 ? [row] : [],
  });

  if (gameState.turn >= 3) {
    await interaction.followUp({ content: "⚖️ ショーダウン！判定しています、、" });
    await finalizeGame(gameState, client, combinedPath, interaction);
  }
}

// --- 勝敗判定（poker.js 固有の金額ロジックを維持） ---
async function finalizeGame(gameState, client, combinedPath, interaction, forcedWinner = null) {
  if (gameState.finalized) return;
  gameState.finalized = true;

  const userId = interaction.user.id;
  const playerRank = evaluateHandStrength(gameState.playerHand);
  const botRank = evaluateHandStrength(gameState.botHand);

  let winner = forcedWinner;
  if (!winner) {
    const cmp = compareHandsDetailed(gameState.playerHand, gameState.botHand);
    if (cmp > 0) winner = "player";
    else if (cmp < 0) winner = "bot";
    else winner = "draw";
  }


  // --- 金額計算 ---
  const bet = Math.max(0, Number(gameState.playerBet || 0));
  const botNorm = botRank / 9;
  const botStrength77 = 77 + Math.round(botNorm * 123);

  let finalAmount = 0;

  if (bet <= 1_000_000) {
    const multiplier = 1 + bet / 1_000_000;
    finalAmount = Math.floor(bet * multiplier);
  } else {
    const botNorm = (botStrength77 - 77) / 123;
    const minMultiplier = 1.2 + 0.8 * botNorm; // 弱Bot:1.2倍〜強Bot:2.0倍
    const maxMultiplier = 2.0 + 8.0 * botNorm; // 弱Bot:2倍〜強Bot:10倍
    const scaleBoost = Math.min(1 + Math.log10(bet / 1_000_000) * 0.5, 2.0);
    const minGain = bet * minMultiplier;
    const maxGain = bet * maxMultiplier * scaleBoost;
    const dynamicGain = minGain + (maxGain - minGain) * botNorm;
    const variance = 0.15;
    const randomFactor = 1 + (Math.random() - 0.5) * variance * 2;
    finalAmount = Math.floor(dynamicGain * randomFactor);
  }

  const lossMultiplier = 3;
  let msg = "";

  if (winner === "player") {
    await client.updateCoins(userId, finalAmount);
    msg = `🎉 勝ち！ +${finalAmount} コイン\nあなたの役: ${["ハイカード","ワンペア","ツーペア","スリーカード","ストレート","フラッシュ","フルハウス","フォーカード","ストレートフラッシュ","ロイヤルフラッシュ"][playerRank]}\n🤖の役: ${["ハイカード","ワンペア","ツーペア","スリーカード","ストレート","フラッシュ","フルハウス","フォーカード","ストレートフラッシュ","ロイヤルフラッシュ"][botRank]}\nBot強さ: ${botStrength77}`;
  } else if (winner === "bot") {
    const loss = Math.floor(finalAmount * lossMultiplier);
    await client.updateCoins(userId, -loss);
    msg = `💀 負け！ -${loss} コイン\nあなたの役: ${["ハイカード","ワンペア","ツーペア","スリーカード","ストレート","フラッシュ","フルハウス","フォーカード","ストレートフラッシュ","ロイヤルフラッシュ"][playerRank]}\n🤖の役: ${["ハイカード","ワンペア","ツーペア","スリーカード","ストレート","フラッシュ","フルハウス","フォーカード","ストレートフラッシュ","ロイヤルフラッシュ"][botRank]}\nBot強さ: ${botStrength77}`;
  } else {
    const refund = Math.floor(bet / 2);
    await client.updateCoins(userId, refund);
    msg = `🤝 引き分け！ +${refund} コイン返却\nあなたの役: ${["ハイカード","ワンペア","ツーペア","スリーカード","ストレート","フラッシュ","フルハウス","フォーカード","ストレートフラッシュ","ロイヤルフラッシュ"][playerRank]}\n🤖の役: ${["ハイカード","ワンペア","ツーペア","スリーカード","ストレート","フラッシュ","フルハウス","フォーカード","ストレートフラッシュ","ロイヤルフラッシュ"][botRank]}\nBot強さ: ${botStrength77}`;
  }

  await generateImage(gameState, 5, combinedPath);
  const file = new AttachmentBuilder(combinedPath);

  await interaction.editReply({
    content: `${msg}\n🤖 Botの手札: ${gameState.botHand.join(" ")}\n現在の所持金: ${await client.getCoins(userId)}`,
    files: [file],
    components: []
  });

  setTimeout(() => { try { fs.unlinkSync(combinedPath); } catch {} }, 5000);
}

// --- 画像生成（修正版）---
async function generateImage(gameState, revealCount, combinedPath) {
  const isRevealAll = revealCount >= 5 || gameState.turn >= 3;

  // カードを1枚ずつ引数として展開
  const scriptArgs = [
    ...gameState.playerHand,  // プレイヤー5枚
    ...gameState.botHand,     // ボット5枚
    isRevealAll ? "1" : "0", // reveal
    combinedPath              // 出力パス
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(pythonCmd, [pythonPath, ...scriptArgs]);

    let stderr = "";
    proc.stdout.on("data", d => console.log("[python stdout]", d.toString()));
    proc.stderr.on("data", d => { stderr += d.toString(); console.error("[python stderr]", d.toString()); });

    proc.on("error", err => {
      console.error("[poker] spawn error:", err);
      reject(err);
    });

    proc.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `Python exited with code ${code}`));
    });
  });
}





