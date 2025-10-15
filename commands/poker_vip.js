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
    return interaction.reply({
      content: "❌ このチャンネルで進行中のゲームがあります！",
      ephemeral: true,
    });
  }

  const bet = 1; // 初期ベット
  const initialCoins = await client.getCoins(userId);
  if (initialCoins < bet)
    return interaction.reply({ content: "❌ 金コインが足りません！", flags: 64 });

  ongoingGames.set(gameKey, true);
  await interaction.deferReply();

  // --- Bot強さ計算（ベット額に応じて2〜5倍） ---
  function calcBotStrength(bet, maxBet = 30) {
    const min = 2;
    const max = 5;
    const strength = min + ((bet - 1) / (maxBet - 1)) * (max - min);
    return Math.min(max, Math.max(min, strength));
  }

  // --- Botの手札生成 ---
  function drawBotHand(deck, bet) {
    const botStrength = calcBotStrength(bet);
    const trials = Math.floor(10 + 100 * botStrength);
    let bestHand = null;
    let bestScore = -1;

    for (let i = 0; i < trials; i++) {
      const tempDeck = [...deck];
      const hand = tempDeck.splice(0, 5);
      const score = evaluateHandStrength(hand) * botStrength;
      if (score > bestScore) {
        bestScore = score;
        bestHand = hand;
      }
    }

    for (const card of bestHand) {
      const idx = deck.indexOf(card);
      if (idx !== -1) deck.splice(idx, 1);
    }

    return bestHand;
  }

  // --- デッキ構築 ---
  const suits = ["S","H","D","C"];
  const ranks = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const deck = [];
  for (const r of ranks) for (const s of suits) deck.push(r+s);
  deck.sort(() => Math.random()-0.5);

  const playerHand = deck.splice(0,5);
  const botHand = drawBotHand(deck, bet);

  // ★ 画像干渉防止のためユニークパス
  const timestamp = Date.now();
  const combinedPath = path.resolve(__dirname, `../python/images/poker_vip_${userId}_${timestamp}.png`);

  const gameState = {
    turn:0,
    playerHand,
    botHand,
    deck,
    bet,
    playerBet: bet,
    requiredBet: bet,
    hasActed:false,
    active:true,
    finalized:false, // ← 勝敗確定済みフラグ
    gameKey
  };

  await client.updateCoins(userId, -bet);
  await generateImage(gameState,3,combinedPath);

  // --- カスタムID をユニーク化（gameKey プレフィックス） ---
  const mkId = (id) => `${gameKey}:${id}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(mkId("call")).setLabel("コール").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(mkId("fold")).setLabel("フォールド").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(mkId("bet1")).setLabel("ベット +1").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(mkId("bet10")).setLabel("ベット +10").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(mkId("customBet")).setLabel("💬 ベット指定").setStyle(ButtonStyle.Secondary)
  );

  const file = new AttachmentBuilder(combinedPath);
  await interaction.editReply({ 
    content:`🎲 あなたの手札です。現在のベット: ${gameState.playerBet} 金コイン`, 
    files:[file], 
    components:[row] 
  });

  const filter = i => i.user.id === userId && i.customId?.startsWith(gameKey + ":");
  const collector = interaction.channel.createMessageComponentCollector({ filter, time: 90000 });

  // 再入禁止ユーティリティ（collector 終了およびファイル削除は一箇所で）
  async function endGameCleanup(reason, forcedWinner = null) {
    if (gameState.finalized) return;
    gameState.finalized = true;
    try { if (!collector.ended) collector.stop(reason || "finished"); } catch {}
    try { await finalizeGame(gameState, client, combinedPath, interaction, forcedWinner); } catch (e) { console.error(e); }
    ongoingGames.delete(gameKey);
  }

  collector.on("collect", async btnInt => {
    try {
      // もし既に勝敗確定していたら無視
      if (gameState.finalized) {
        return btnInt.reply({ content: "このゲームは既に終了しています。", flags: 64 });
      }

      const userCoins = await client.getCoins(userId);
      gameState.hasActed = true;

      // action を抽出
      const [, action] = btnInt.customId.split(":");

      // 固定ベット
      if (action && action.startsWith("bet") && action !== "customBet") {
        let add = 0;
        switch(action){
          case "bet1": add = 1; break;
          case "bet10": add = 10; break;
        }

        if(add > userCoins) return btnInt.reply({ content: "❌ 金コインが足りません！", flags: 64 });

        gameState.playerBet += add;
        gameState.requiredBet = Math.max(gameState.requiredBet, gameState.playerBet);
        await client.updateCoins(userId, -add);

        await btnInt.update({ 
          content: `🎲 あなたの手札です。現在のベット: ${gameState.playerBet} 金コイン`, 
          files: [new AttachmentBuilder(combinedPath)],
          components: [row]
        });
        return;
      }

      // カスタムベット
      if(action === "customBet"){
        const modal = new ModalBuilder().setCustomId(mkId("customBetModal")).setTitle("ベット金額を入力");
        const input = new TextInputBuilder().setCustomId("betAmount").setLabel("ベット金額（整数）").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await btnInt.showModal(modal);

        const submitted = await btnInt.awaitModalSubmit({ time: 30000 }).catch(() => null);
        if(!submitted) return;

        const betValue = Number(submitted.fields.getTextInputValue("betAmount"));
        if(isNaN(betValue) || betValue <= 0) return submitted.reply({ content:"❌ 無効な金額です", flags:64 });
        if(betValue > userCoins) return submitted.reply({ content:"❌ 金コインが足りません！", flags:64 });

        gameState.playerBet += betValue;
        gameState.requiredBet = Math.max(gameState.requiredBet, gameState.playerBet);
        await client.updateCoins(userId, -betValue);

        await interaction.editReply({ 
          content:`🎲 あなたの手札です。現在のベット: ${gameState.playerBet} 金コイン`, 
          files:[new AttachmentBuilder(combinedPath)], 
          components:[row] 
        });
        await submitted.reply({ content:`💰 ${betValue} 金コインを追加しました（合計ベット: ${gameState.playerBet}）`, flags:64 });
        return;
      }

      // フォールド
      if (action === "fold"){
        gameState.active = false;
        await btnInt.update({ content:"🫱 あなたはフォールドしました。🤖 の勝ちです！", components: [] });
        await endGameCleanup("folded", "bot");
        return;
      }

      // コール
      if (action === "call") {
        if (gameState.playerBet < gameState.requiredBet) {
          return btnInt.reply({
            content: `❌ レイズ額が未払いです。最低 ${gameState.requiredBet} 金コインまでベットしてください`,
            flags: 64
          });
        }

        const callAmount = gameState.requiredBet - gameState.playerBet;
        if (callAmount > 0) {
          if (callAmount > userCoins) return btnInt.reply({ content: "❌ コインが足りません！", flags: 64 });
          await client.updateCoins(userId, -callAmount);
          gameState.playerBet += callAmount;
        }

        await btnInt.update({ content: "✅ コールしました！", components: [row], files: [new AttachmentBuilder(combinedPath)] });

        // 画像更新（相手のターン前の表示）
        await generateImage(gameState, 3, combinedPath);
        await interaction.editReply({
          content: `🎲 あなたの手札です。現在のベット: ${gameState.playerBet} 金コイン`,
          files: [new AttachmentBuilder(combinedPath)],
          components: [row]
        });

        // Bot が行動（ただしゲームが既に確定していないか再チェック）
        if (!gameState.finalized) {
          await botTurn(gameState, client, interaction, combinedPath, collector, endGameCleanup);
        }
        return;
      }

    } catch(err) {
      console.error(err);
      ongoingGames.delete(gameKey);
      try { if (!btnInt.replied) await btnInt.reply({ content:"❌ エラーが発生しました", flags:64 }); } catch {}
    }
  });

  // --- collector 終了処理 ---
  collector.on("end", async (_, reason) => {
    // タイムアウト時の返却処理
    if (gameState.finalized) {
      // 既に finalize が走っているなら何もしない
      try { fs.unlinkSync(combinedPath); } catch {}
      return;
    }

    if (!gameState.hasActed && (reason === "time" || reason === "idle")) {
      // タイムアウト、ベットを返却
      await client.updateCoins(userId, gameState.playerBet);
      await interaction.editReply({ content: `⌛ タイムアウト。ベットを返却しました。`, components: [] });
      ongoingGames.delete(gameKey);
      try { fs.unlinkSync(combinedPath); } catch {}
      return;
    }

    // completed 等で正常終了を期待する場合は finalize を呼ぶ
    if (!gameState.finalized && (reason === "completed" || reason === "finished")) {
      await endGameCleanup("completed");
    }
    // それ以外の理由（foldedなど）は endGameCleanup 内で処理済み
    try { fs.unlinkSync(combinedPath); } catch {}
  });
}

// --- Botターン（手札強さに応じて積極的にレイズ、小額ベット調整版） ---
async function botTurn(gameState, client, interaction, combinedPath, collector, endGameCleanup) {
  // 既に確定してたら抜ける
  if (gameState.finalized) return;

  const botStrength = evaluateHandStrength(gameState.botHand); // 0〜1で強さ

  // 手札強さに応じてレイズ確率（0.2〜0.9）
  const raiseProb = 0.2 + 0.7 * botStrength; 
  let decision = Math.random() < raiseProb ? "raise" : "call";

  // ベット額に応じたレイズ額を計算
  function calcRaiseAmount(currentBet, strength){
    if(currentBet === 1) return 1 + Math.floor(Math.random() * 2);
    const minRaise = Math.max(1, Math.floor(currentBet * 0.05 * (1 + strength)));
    const maxRaise = Math.max(minRaise + 1, Math.floor(currentBet * 0.15 * (1 + strength) * 1.5));
    return Math.floor(minRaise + Math.random() * (maxRaise - minRaise + 1));
  }

  if(decision === "raise") {
    const raiseAmount = calcRaiseAmount(gameState.requiredBet, botStrength);
    gameState.requiredBet += raiseAmount;
    // Bot はプレイヤーに対するアクションとしてレイズを通知するだけ（実資金の引き落としはプレイヤーが行う）
    await interaction.followUp({content:`🤖 はレイズしました！ (+${raiseAmount} 金コイン)`});
  } else {
    await interaction.followUp({content:`🤖 はコールしました。`});
  }

  // 次のステージへ（進行は一度だけ行う）
  await proceedToNextStage(gameState, client, combinedPath, interaction, collector, endGameCleanup);
}

// --- ターン進行 ---
async function proceedToNextStage(gameState, client, combinedPath, interaction, collector, endGameCleanup) {
  if (gameState.finalized) return;

  // 現在の turn に対して表示する枚数（ターン 0 -> 3枚, 1->4枚, 2->5枚）
  let revealCount;
  if (gameState.turn === 0) revealCount = 3;
  else if (gameState.turn === 1) revealCount = 4;
  else revealCount = 5;

  await generateImage(gameState, revealCount, combinedPath);
  const file = new AttachmentBuilder(combinedPath);

  await interaction.editReply({
    content: `🃏 ターン${gameState.turn + 1} 終了。現在のベット: ${gameState.playerBet} 金コイン`,
    files: [file]
  });

  // ターンを進める
  gameState.turn++;

  // ターンが3（＝全て公開済み）以上になったら勝敗判定へ
  if (gameState.turn >= 3) {
    // finalize を一度だけ呼ぶ
    await endGameCleanup("completed");
  }
}

// --- 手札強さ評価（役考慮版） ---
function evaluateHandStrength(hand) {
  const rankValue = { "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"T":10,"J":11,"Q":12,"K":13,"A":14 };
  const ranks = hand.map(c => c[0]);
  const suits = hand.map(c => c[1]);

  let score = 0;

  // ランク合計
  for(const r of ranks) score += rankValue[r] || 0;

  // ペア
  const rankCounts = {};
  for(const r of ranks) rankCounts[r] = (rankCounts[r]||0)+1;
  if(Object.values(rankCounts).includes(2)) score += 20;

  // ストレート（2枚なので隣接していればストレート扱い）
  const values = ranks.map(r => rankValue[r]).sort((a,b)=>a-b);
  if(values[1] - values[0] === 1) score += 30;

  // フラッシュ（同スート）
  if(suits[0] === suits[1]) score += 10;

  // 正規化 0〜1
  const minScore = 4;   // 最低 2+2
  const maxScore = 28 + 20 + 30 + 10; // 最大 A+A + ペア + ストレート + フラッシュ
  const normalized = (score - minScore) / (maxScore - minScore);
  return Math.max(0, Math.min(1, normalized));
}

// --- 0〜1 を 77〜200 に変換 ---
function botStrength77to200(normStrength) {
  const min = 77;
  const max = 200;
  return Math.round(min + normStrength * (max - min));
}

// --- プレイヤー勝利時報酬倍率計算（2〜5倍） ---
function calculatePlayerReward(baseBet, botStrength) {
  const minStrength = 77;
  const maxStrength = 200;
  const minMultiplier = 2;
  const maxMultiplier = 5;

  const norm = (botStrength - minStrength) / (maxStrength - minStrength);
  const multiplier = minMultiplier + norm * (maxMultiplier - minMultiplier);
  return Math.round(baseBet * multiplier);
}

// --- 勝敗判定 ---
export async function finalizeGame(gameState, client, combinedPath, interaction, forcedWinner = null) {
  // 二重呼び出し防止
  if (gameState.finalized) return;
  gameState.finalized = true;

  const pythonArgs = [pythonPath, ...gameState.playerHand, ...gameState.botHand, "1", combinedPath];
  const proc = spawn(pythonCmd, pythonArgs);

  let stdout = "";
  proc.stdout.on("data", d => stdout += d.toString());
  proc.stderr.on("data", d => console.error("Python stderr:", d.toString()));

  proc.on("close", async code => {
    const userId = interaction.user.id;
    if (code !== 0) {
      console.error("Python returned non-zero:", code);
      // Python が失敗したら JS 側で簡易判定（evaluateHandStrength）で決着をつける
    }

    let winner = null;
    if (forcedWinner) {
      winner = forcedWinner;
    } else {
      const out = stdout.trim();
      if (out) {
        const parsed = out.split(",").map(s => s.trim());
        winner = parsed[0] || null;
      }
    }

    // fallback: Python 判定できなかったら JS 側で強さ比較
    if (!winner) {
      const pScore = evaluateHandStrength(gameState.playerHand);
      const bScore = evaluateHandStrength(gameState.botHand);
      winner = pScore > bScore ? "player" : (bScore > pScore ? "bot" : "draw");
    }

    const baseBet = Math.max(1, gameState.playerBet || 1);

    const botNorm = evaluateHandStrength(gameState.botHand);
    const botStrength = botStrength77to200(botNorm);

    let msg = "";
    let playerChange = 0;

    if (winner === "player") {
    playerChange = calculatePlayerReward(baseBet, botStrength);
    await client.updateCoins(userId, playerChange);
    msg = `🎉 勝ち！ +${playerChange} 金コイン（Bot強さ×${botStrength}）`;
    } else if (winner === "bot") {
    playerChange = -baseBet * 3;
    await client.updateCoins(userId, playerChange);
    const current = await client.getCoins(userId);
    if (current < 0) await client.setCoins(userId, 0);
    msg = `💀 負け！ -${-playerChange} 金コイン`;
    } else {
    const refund = Math.floor(baseBet / 2);
    await client.updateCoins(userId, refund);
    msg = `🤝 引き分け！ +${refund} 金コイン返却`;
    }

    try { await generateImage(gameState, 5, combinedPath); } catch (e) { console.error(e); }
    const file = new AttachmentBuilder(combinedPath);
    const currentCoins = await client.getCoins(userId);
    await interaction.editReply({
      content: `${msg}\n🤖 Bot手札: ${gameState.botHand.join(" ")}\n現在の金コイン: ${currentCoins}`,
      files: [file],
      components: []
    });

    // 後片付け
    setTimeout(() => { try { fs.unlinkSync(combinedPath); } catch {} }, 5000);
  });
}

// --- 画像生成 ---
async function generateImage(gameState, revealCount, combinedPath) {
  const isRevealAll = revealCount >= 5;
  const args = [pythonPath, ...gameState.playerHand, ...gameState.botHand, isRevealAll ? "1" : "0", combinedPath];

  return new Promise((resolve, reject) => {
    const proc = spawn(pythonCmd, args);
    let stderr = "";
    proc.stderr.on("data", d => stderr += d.toString());
    proc.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`Python error (code ${code}): ${stderr}`));
    });
  });
}
