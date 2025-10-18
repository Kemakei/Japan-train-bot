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
  .setName("poker")
  .setDescription("Botとポーカーで勝負");

export async function execute(interaction) {
  const client = interaction.client;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;
  const gameKey = `${channelId}-${userId}`;

  if (ongoingGames.has(gameKey)) {
    return interaction.reply({
      content: "❌ このチャンネルであなたの進行中ゲームがあります！",
      ephemeral: true,
    });
  }

  const initialCoins = await client.getCoins(userId);
  const bet = 1000;
  if (initialCoins < bet)
    return interaction.reply({ content: "❌ コインが足りません！", flags: 64 });

  ongoingGames.set(gameKey, true);
  await interaction.deferReply();

function drawBotHand(deck, bet) {
  const scaling = Math.pow(bet / 1000, 1/3); // 1000→1x, 10億→30x
  const trials = Math.floor(10 * scaling);

  // ベットに応じて強カード優遇
  const rankBias = Math.min(1, Math.log10(bet / 1000 + 1) / 3); // 1000→0, 10億→1
  const biasRanks = ["T", "J", "Q", "K", "A"];
  const biasedDeck = deck.slice().sort((a, b) => {
    const ra = biasRanks.includes(a[0]) ? -rankBias : 0;
    const rb = biasRanks.includes(b[0]) ? -rankBias : 0;
    return ra - rb + (Math.random() - 0.5) * 0.1;
  });

  let bestHand = null;
  let bestStrength = -1;

  for (let i = 0; i < trials; i++) {
    const tempDeck = [...biasedDeck];
    const hand = tempDeck.splice(0, 5);
    const strength = evaluateHandStrength(hand);
    if (strength > bestStrength) {
      bestStrength = strength;
      bestHand = hand;
    }
  }

  // deckから削除
  for (const card of bestHand) {
    const idx = deck.indexOf(card);
    if (idx !== -1) deck.splice(idx, 1);
  }

  return bestHand;
  }

  // --- デッキ作成 ---
  const suits = ["S", "H", "D", "C"];
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
  const deck = [];
  for (const r of ranks) for (const s of suits) deck.push(r + s);
  deck.sort(() => Math.random() - 0.5);

  const playerHand = deck.splice(0, 5);
  const botHand = drawBotHand(deck, bet);

  const timestamp = Date.now();
  const combinedPath = path.resolve(__dirname, `../python/images/combined_${userId}_${timestamp}.png`);

  const gameState = {
    turn: 0,
    playerHand,
    botHand,
    deck,
    bet,
    playerBet: bet,
    requiredBet: bet,
    hasActed: false,
    active: true,
    gameKey,
    finalized: false,
  };

  // 先にベットを引く
  await client.updateCoins(userId, -bet);
  await generateImage(gameState, 3, combinedPath);

  const mkId = (id) => `${gameKey}:${id}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(mkId("call")).setLabel("コール").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(mkId("fold")).setLabel("フォールド").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(mkId("bet1000")).setLabel("ベット +1000").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(mkId("bet10000")).setLabel("ベット +10000").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(mkId("customBet")).setLabel("💬 ベット指定").setStyle(ButtonStyle.Secondary)
  );

  const file = new AttachmentBuilder(combinedPath);
  await interaction.editReply({
    content: `🎲 あなたの手札です。現在のベット: ${bet} コイン`,
    files: [file],
    components: [row],
  });

  // collector filter を厳密に（gameKey を先頭に持つ customId のみ受け取る）
  const filter = (i) => i.user.id === userId && i.customId?.startsWith(gameKey + ":");
  const collector = interaction.channel.createMessageComponentCollector({ filter, time: 90000 });

  async function endGameCleanup(reason, forcedWinner = null) {
    if (gameState.finalized) return;
    try { if (!collector.ended) collector.stop(reason || "completed"); } catch (e) { console.error(e); }
    try { await finalizeGame(gameState, client, combinedPath, interaction, forcedWinner); } catch (e) { console.error(e); }
    finally { ongoingGames.delete(gameKey); }
  }

  collector.on("collect", async (btnInt) => {
    try {
      if (gameState.finalized) return btnInt.reply({ content: "このゲームは既に終了しています。", flags: 64 });

      const userCoins = await client.getCoins(userId);
      gameState.hasActed = true;
      const [, action] = btnInt.customId.split(":");

      // 固定ベット
      if (action && action.startsWith("bet") && action !== "customBet") {
        const add = action === "bet1000" ? 1000 : 10000;
        if (add > userCoins) return btnInt.reply({ content: "❌ コインが足りません！", flags: 64 });

        gameState.playerBet += add;
        gameState.requiredBet = Math.max(gameState.requiredBet, gameState.playerBet);
        await client.updateCoins(userId, -add);

        // 画像は変わらないのでファイルは再利用
        await btnInt.update({
          content: `🎲 あなたの手札です。現在のベット: ${gameState.playerBet} コイン`,
          files: [new AttachmentBuilder(combinedPath)],
          components: [row]
        });

        await btnInt.followUp({ content: `💰 ${add} コインを追加しました（合計ベット: ${gameState.playerBet}）`, ephemeral: true });
        return;
      }

      // カスタムベット
      if (action === "customBet") {
        const modal = new ModalBuilder().setCustomId(mkId("customBetModal")).setTitle("ベット金額を入力");
        const input = new TextInputBuilder().setCustomId("betAmount").setLabel("ベット金額（整数）").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await btnInt.showModal(modal);

        const submitted = await btnInt.awaitModalSubmit({ time: 30000 }).catch(() => null);
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

        await submitted.reply({ content: `💰 ${betValue} コインを追加しました（合計ベット: ${gameState.playerBet}）`, ephemeral: true });
        return;
      }

      // フォールド
      if (action === "fold") {
        gameState.active = false;
        await btnInt.update({ content: "🫱 あなたはフォールドしました。🤖 の勝ちです！", components: [] });
        await endGameCleanup("folded", "bot");
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

        await btnInt.update({ content: "✅ コールしました！", components: [row], files: [new AttachmentBuilder(combinedPath)] });

        await generateImage(gameState, 3, combinedPath);
        await interaction.editReply({
          content: `🎲 あなたの手札です。現在のベット: ${gameState.playerBet} コイン`,
          files: [new AttachmentBuilder(combinedPath)],
          components: [row]
        });

        // bot ターン（ただし最終ターンでは呼ばない）
        if (gameState.turn < 3 && !gameState.finalized) {
          await botTurn(gameState, client, interaction, combinedPath, collector, endGameCleanup, row);
        }
        return;
      }

    } catch (err) {
      console.error(err);
      ongoingGames.delete(gameKey);
      try { if (!btnInt.replied) await btnInt.reply({ content: "❌ エラーが発生しました", flags: 64 }); } catch {}
    }
  });

  collector.on("end", async (_, reason) => {
    ongoingGames.delete(gameKey);

    if (!gameState.hasActed) {
      // 何も操作されなかった場合はベットを返金
      await client.updateCoins(userId, gameState.playerBet);
      await interaction.editReply({ content: `⌛ タイムアウト。ベットを返却しました。`, components: [] });
      try { fs.unlinkSync(combinedPath); } catch {}
      return;
    }

    if (reason === "completed") {
      await finalizeGame(gameState, client, combinedPath, interaction);
    }

    try { fs.unlinkSync(combinedPath); } catch {}
  });
}

// --- Bot ターン ---
async function botTurn(gameState, client, interaction, combinedPath, collector, endGameCleanup, row) {
  if (gameState.finalized) return;

  const botStrength = evaluateHandStrength(gameState.botHand);
  const randomFactor = Math.random();
  let decision = "call";

  if (botStrength > 0.6 && randomFactor < 0.6) decision = "raise";
  else if (botStrength > 0.4 && randomFactor < 0.3) decision = "raise";
  else if (botStrength < 0.3 && randomFactor < 0.1) decision = "raise";
  else decision = "call";

  if (decision === "raise") {
    const raiseAmount = Math.floor(1000 + Math.random() * 9000);
    gameState.requiredBet += raiseAmount;
    await interaction.followUp({ content: `🤖 はレイズしました！ (${raiseAmount} コイン)` });
  } else {
    await interaction.followUp({ content: `🤖 はコールしました。` });
  }

  await proceedToNextStage(gameState, client, combinedPath, interaction, collector, row);
}

// --- ターン進行 ---
async function proceedToNextStage(gameState, client, combinedPath, interaction, collector, row) {
  // reveal pattern をより明示的に（poker_vip に寄せた動作）
  const revealPattern = [3, 4, 5];
  const revealCount = revealPattern[Math.min(gameState.turn, revealPattern.length - 1)];

  await generateImage(gameState, revealCount, combinedPath);
  const file = new AttachmentBuilder(combinedPath);

  await interaction.editReply({
    content: `🃏 ターン${gameState.turn + 1} 終了。現在のベット: ${gameState.playerBet} コイン`,
    files: [file],
    components: gameState.turn < 2 ? [row] : []
  });

  gameState.turn++;

  // 3ターン目（turn >= 2）で勝敗確定
  if (gameState.turn >= 2) {
    if (!collector.ended) collector.stop("completed");
  }
}

// --- Bot 強さ 0〜1 → 77〜200 に変換 ---
function botStrength77to200(normStrength) {
  const min = 77;
  const max = 200;
  const val = Math.round(min + normStrength * (max - min));
  return Math.max(min, Math.min(max, val));
}

// --- 勝敗判定（poker.js の金額ロジックは変更しない） ---
async function finalizeGame(gameState, client, combinedPath, interaction, forcedWinner = null) {
  if (gameState.finalized) return;
  gameState.finalized = true;

  const pythonArgs = [pythonPath, ...gameState.playerHand, ...gameState.botHand, "1", combinedPath];
  const proc = spawn(pythonCmd, pythonArgs);
  let stdout = "";
  proc.stdout.on("data", (d) => (stdout += d.toString()));
  proc.stderr.on("data", (d) => console.error("Python stderr:", d.toString()));

  proc.on("close", async (code) => {
    const userId = interaction.user.id;
    if (code !== 0)
      return interaction.followUp({ content: "❌ 勝敗判定エラー", flags: 64 });

    const [winner] = forcedWinner ? [forcedWinner] : stdout.trim().split(",").map((s) => s.trim());
    const bet = Math.max(0, Number(gameState.playerBet || 0));
    const botNorm = evaluateHandStrength(gameState.botHand);
    const botStrength77 = botStrength77to200(botNorm);

    // 勝ち時の計算（元の poker.js と同一）
    let finalAmount = 0;
    if (bet <= 1_000_000) {
      const multiplier = 1 + bet / 1_000_000;
      finalAmount = Math.floor(bet * multiplier);
    } else {
      const tiny = 1e-12;
      const denom = Math.max(tiny, bet * 0.0001);
      const partA = (1_000_000 / denom) * 1_000_000;
      const partB = bet * 0.01 * botStrength77;
      finalAmount = Math.floor(partA + partB);
    }

    const lossMultiplier = 3; // ← 負けの時はこれだけ多く失う
    let msg = "";

    if (winner === "player") {
      await client.updateCoins(userId, finalAmount);
      msg = `🎉 勝ち！ +${finalAmount} コイン（計算式適用）\nBot 強さ（77-200）: ${botStrength77}`;
    } else if (winner === "bot") {
      const loss = Math.floor(finalAmount * lossMultiplier);
      await client.updateCoins(userId, -loss);
      msg = `💀 負け！ -${loss} コイン（損失倍率 ${lossMultiplier}x）\nBot 強さ（77-200）: ${botStrength77}`;
    } else {
      const refund = Math.floor(bet / 2);
      await client.updateCoins(userId, refund);
      msg = `🤝 引き分け！ +${refund} コイン返却\nBot 強さ（77-200）: ${botStrength77}`;
    }

    await generateImage(gameState, 5, combinedPath);
    const file = new AttachmentBuilder(combinedPath);

    await interaction.editReply({
      content: `${msg}\n🤖 Botの手札: ${gameState.botHand.join(" ")}\n現在の所持金: ${await client.getCoins(userId)}`,
      files: [file],
      components: [],
    });

    setTimeout(() => { try { fs.unlinkSync(combinedPath); } catch {} }, 5000);
  });
}

// --- 手札強さ ---
function evaluateHandStrength(hand) {
  const ranks = "23456789TJQKA";
  let score = 0;
  const rankCounts = {};
  const suits = {};

  for (const card of hand) {
    const rank = card[0];
    const suit = card[1];
    rankCounts[rank] = (rankCounts[rank] || 0) + 1;
    suits[suit] = (suits[suit] || 0) + 1;
    score += ranks.indexOf(rank);
  }

  const pairs = Object.values(rankCounts).filter(v => v === 2).length;
  const trips = Object.values(rankCounts).filter(v => v === 3).length;
  const flush = Object.values(suits).some(v => v >= 4);

  if (pairs) score += 10 * pairs;
  if (trips) score += 25;
  if (flush) score += 30;

  return Math.min(1, score / 120);
}

// --- 画像生成 ---
async function generateImage(gameState, revealCount, combinedPath) {
  // poker_vip と同様に revealCount に応じて isRevealAll を決定
  const isRevealAll = revealCount >= 5 || gameState.turn >= 3;
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
