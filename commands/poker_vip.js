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
    finalized:false,
    gameKey
  };

  await client.updateCoins(userId, -bet);
  await generateImage(gameState,3,combinedPath);

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

  async function endGameCleanup(reason, forcedWinner = null) {
    if (gameState.finalized) return;
    gameState.finalized = true;
    try { if (!collector.ended) collector.stop(reason || "finished"); } catch {}
    try { await finalizeGame(gameState, client, combinedPath, interaction, forcedWinner); } catch (e) { console.error(e); }
    ongoingGames.delete(gameKey);
  }

  collector.on("collect", async btnInt => {
    try {
      if (gameState.finalized) return btnInt.reply({ content: "このゲームは既に終了しています。", flags: 64 });

      const userCoins = await client.getCoins(userId);
      gameState.hasActed = true;
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

        // 画像更新
        await generateImage(gameState, 3, combinedPath);
        await interaction.editReply({
          content: `🎲 あなたの手札です。現在のベット: ${gameState.playerBet} 金コイン`,
          files: [new AttachmentBuilder(combinedPath)],
          components: [row]
        });

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

  collector.on("end", async (_, reason) => {
    if (gameState.finalized) { try { fs.unlinkSync(combinedPath); } catch {} return; }

    if (!gameState.hasActed && (reason === "time" || reason === "idle")) {
      await client.updateCoins(userId, gameState.playerBet);
      await interaction.editReply({ content: `⌛ タイムアウト。ベットを返却しました。`, components: [] });
      ongoingGames.delete(gameKey);
      try { fs.unlinkSync(combinedPath); } catch {}
      return;
    }

    try { fs.unlinkSync(combinedPath); } catch {}
  });
}

// --- Botターン ---
async function botTurn(gameState, client, interaction, combinedPath, collector, endGameCleanup) {
  if (gameState.finalized) return;

  const botStrength = evaluateHandStrength(gameState.botHand);
  const raiseProb = 0.2 + 0.7 * botStrength;
  let decision = Math.random() < raiseProb ? "raise" : "call";

  function calcRaiseAmount(currentBet, strength){
    if(currentBet === 1) return 1 + Math.floor(Math.random() * 2);
    const minRaise = Math.max(1, Math.floor(currentBet * 0.05 * (1 + strength)));
    const maxRaise = Math.max(minRaise + 1, Math.floor(currentBet * 0.15 * (1 + strength) * 1.5));
    return Math.floor(minRaise + Math.random() * (maxRaise - minRaise + 1));
  }

  if(decision === "raise") {
    const raiseAmount = calcRaiseAmount(gameState.requiredBet, botStrength);
    gameState.requiredBet += raiseAmount;
    await interaction.followUp({content:`🤖 はレイズしました！ (+${raiseAmount} 金コイン)`});
  } else {
    await interaction.followUp({content:`🤖 はコールしました。`});
  }

  await proceedToNextStage(gameState, client, combinedPath, interaction, collector, endGameCleanup);
}

// --- ターン進行（3,3,3,全公開） ---
async function proceedToNextStage(gameState, client, combinedPath, interaction, collector, endGameCleanup) {
  if (gameState.finalized) return;

  let revealCount;
  if (gameState.turn < 3) revealCount = 3;
  else revealCount = 5; // ターン4で全公開

  await generateImage(gameState, revealCount, combinedPath);
  const file = new AttachmentBuilder(combinedPath);

  await interaction.editReply({
    content: `🃏 ターン${gameState.turn + 1} 終了。現在のベット: ${gameState.playerBet} 金コイン`,
    files: [file]
  });

  gameState.turn++;

  if (gameState.turn >= 4 && !gameState.finalized) {
    gameState.finalized = true;
    if (!collector.ended) collector.stop("finished");
    await finalizeGame(gameState, client, combinedPath, interaction);
  }
}

// --- 手札強さ評価 ---
function evaluateHandStrength(hand) {
  const rankValue = { "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"T":10,"J":11,"Q":12,"K":13,"A":14 };
  const ranks = hand.map(c => c[0]);
  const suits = hand.map(c => c[1]);

  let score = 0;
  for(const r of ranks) score += rankValue[r] || 0;

  const rankCounts = {};
  for(const r of ranks) rankCounts[r] = (rankCounts[r]||0)+1;
  if(Object.values(rankCounts).includes(2)) score += 20;

  const values = ranks.map(r => rankValue[r]).sort((a,b)=>a-b);
  if(values[1] - values[0] === 1) score += 30;
  if(suits[0] === suits[1]) score += 10;

  const minScore = 4;
  const maxScore = 28 + 20 + 30 + 10;
  const normalized = (score - minScore) / (maxScore - minScore);
  return Math.max(0, Math.min(1, normalized));
}

// --- 0〜1 を 77〜200 に変換 ---
function botStrength77to200(normStrength) {
  const min = 77;
  const max = 200;
  return Math.round(min + normStrength * (max - min));
}

// --- プレイヤー勝利時報酬倍率計算 ---
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
  if (gameState.finalized) return;
  gameState.finalized = true;

  const pythonArgs = [pythonPath, ...gameState.playerHand, ...gameState.botHand, "1", combinedPath];
  const proc = spawn(pythonCmd, pythonArgs);

  let stdout = "";
  proc.stdout.on("data", d => stdout += d.toString());
  proc.stderr.on("data", d => console.error("Python stderr:", d.toString()));

  proc.on("close", async code => {
    const userId = interaction.user.id;
    let winner = forcedWinner;

    if (!winner) {
      const out = stdout.trim();
      if(out) winner = out.split(",")[0] || null;
    }

    if(!winner) {
      const pScore = evaluateHandStrength(gameState.playerHand);
      const bScore = evaluateHandStrength(gameState.botHand);
      winner = pScore > bScore ? "player" : (bScore > pScore ? "bot" : "draw");
    }

    const baseBet = Math.max(1, gameState.playerBet || 1);
    const botNorm = evaluateHandStrength(gameState.botHand);
    const botStrength = botStrength77to200(botNorm);

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

    try { await generateImage(gameState, 5, combinedPath); } catch (e) { console.error(e); }
    const file = new AttachmentBuilder(combinedPath);
    const currentCoins = await client.getCoins(userId);
    await interaction.editReply({
      content: `${msg}\n🤖 Bot手札: ${gameState.botHand.join(" ")}\n現在の金コイン: ${currentCoins}`,
      files: [file],
      components: []
    });

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
