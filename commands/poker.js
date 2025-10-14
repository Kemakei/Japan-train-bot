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
    return interaction.reply({ content: "❌ コインが足りません！", flags: 64});

  ongoingGames.set(gameKey, true);
  await interaction.deferReply();

  // --- Botの手札をベット額に応じて調整 ---
  function drawBotHand(deck, bet) {
    const maxBet = 100000;
    const betRatio = Math.min(1, bet / maxBet);
    const trials = Math.floor(10 + 990 * betRatio);

    let bestHand = null;
    let bestStrength = -1;

    for (let i = 0; i < trials; i++) {
      const tempDeck = [...deck];
      const hand = tempDeck.splice(0, 5);
      const strength = evaluateHandStrength(hand);
      if (strength > bestStrength) {
        bestStrength = strength;
        bestHand = hand;
      }
    }

    for (const card of bestHand) {
      const index = deck.indexOf(card);
      if (index !== -1) deck.splice(index, 1);
    }

    return bestHand;
  }

  // --- デッキ構築 ---
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
  };

  await client.updateCoins(userId, -bet);
  await generateImage(gameState, 3, combinedPath);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("call").setLabel("コール").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("fold").setLabel("フォールド").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("bet1000").setLabel("ベット +1000").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("bet10000").setLabel("ベット +10000").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("customBet").setLabel("💬 ベット指定").setStyle(ButtonStyle.Secondary)
  );

  const file = new AttachmentBuilder(combinedPath);
  await interaction.editReply({
    content: `🎲 あなたの手札です。現在のベット: ${bet} コイン`,
    files: [file],
    components: [row],
  });

  const filter = (i) => i.user.id === userId;
  const collector = interaction.channel.createMessageComponentCollector({ filter, time: 90000 });

  collector.on("collect", async (btnInt) => {
    try {
      const userCoins = await client.getCoins(userId);
      gameState.hasActed = true;

      // --- 固定ベット ---
      if (btnInt.customId.startsWith("bet")) {
        const add = btnInt.customId === "bet1000" ? 1000 : 10000;
        if (add > userCoins)
          return btnInt.reply({ content: "❌ コインが足りません！", flags: 64});

        gameState.playerBet += add;
        gameState.requiredBet = Math.max(gameState.requiredBet, gameState.playerBet);
        await client.updateCoins(userId, -add);

        await interaction.editReply({
          content: `🎲 あなたの手札です。現在のベット: ${gameState.playerBet} コイン`,
          components: [btnInt.message.components[0]],
        });

        await btnInt.reply({
          content: `💰 ${add} コインを追加しました（合計ベット: ${gameState.playerBet}）`,
          ephemeral: true,
        });
        return;
      }

      // --- カスタムベット ---
      if (btnInt.customId === "customBet") {
        const modal = new ModalBuilder().setCustomId("customBetModal").setTitle("ベット金額を入力");
        const input = new TextInputBuilder()
          .setCustomId("betAmount")
          .setLabel("ベット金額（整数）")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await btnInt.showModal(modal);
        const submitted = await btnInt.awaitModalSubmit({ time: 30000 }).catch(() => null);
        if (!submitted) return;
        const betValue = Number(submitted.fields.getTextInputValue("betAmount"));
        if (isNaN(betValue) || betValue <= 0)
          return submitted.reply({ content: "❌ 無効な金額です", flags: 64});
        if (betValue > userCoins)
          return submitted.reply({ content: "❌ コインが足りません！", flags: 64});

        gameState.playerBet += betValue;
        gameState.requiredBet = Math.max(gameState.requiredBet, gameState.playerBet);
        await client.updateCoins(userId, -betValue);

        await interaction.editReply({
          content: `🎲 あなたの手札です。現在のベット: ${gameState.playerBet} コイン`,
          components: [submitted.message.components[0]],
        });

        await submitted.reply({
          content: `💰 ${betValue} コインを追加しました（合計ベット: ${gameState.playerBet}）`,
          ephemeral: true,
        });
        return;
      }

      // --- フォールド ---
      if (btnInt.customId === "fold") {
        gameState.active = false;
        collector.stop("folded");
        await interaction.editReply({
          content: "🫱 あなたはフォールドしました。🤖 の勝ちです！",
          components: [],
        });
        await finalizeGame(gameState, client, combinedPath, interaction, "bot");
        return;
      }

      // --- コール ---
      if (btnInt.customId === "call") {
        if (gameState.playerBet < gameState.requiredBet)
          return btnInt.reply({ content: `❌ レイズ額が未払いです。最低 ${gameState.requiredBet} コインまでベットしてください`, flags: 64});
        await btnInt.reply({ content: "📞 コールしました！", flags: 64});
        await botTurn(gameState, client, btnInt, combinedPath, interaction, collector);
      }

    } catch (err) {
      console.error(err);
      ongoingGames.delete(gameKey);
      if (!btnInt.replied)
        await btnInt.reply({ content: "❌ エラーが発生しました", flags: 64});
    }
  });

  collector.on("end", async (_, reason) => {
    ongoingGames.delete(gameKey);
    if (!gameState.hasActed) {
      await client.updateCoins(userId, gameState.playerBet);
      await interaction.editReply({ content: `⌛ タイムアウト。ベットを返却しました。`, components: [] });
      setTimeout(() => { try { fs.unlinkSync(combinedPath); } catch {} }, 5000);
    }
  });
}

// --- Bot ターン ---
async function botTurn(gameState, client, btnInt, combinedPath, interaction, collector) {
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

  await proceedToNextStage(gameState, client, combinedPath, interaction, collector);
}

// --- ターン進行 ---
async function proceedToNextStage(gameState, client, combinedPath, interaction, collector) {
  let revealCount = gameState.turn === 0 ? 3 : gameState.turn === 1 ? 4 : 5;
  
  await generateImage(gameState, revealCount, combinedPath);
  const file = new AttachmentBuilder(combinedPath);

  await interaction.editReply({
    content: `🃏 ターン${gameState.turn + 1} 終了。現在のベット: ${gameState.playerBet} 金コイン`,
    files: [file]
  });

  // ターン4（0ベースで3）で勝敗判定
  if (gameState.turn >= 3) {
    collector.stop("completed");
    await finalizeGame(gameState, client, combinedPath, interaction);
  } else {
    gameState.turn++;
  }
}

// --- Bot 強さ 0〜1 → 77〜200 に変換 ---
function botStrength77to200(normStrength) {
  const min = 77;
  const max = 200;
  const val = Math.round(min + normStrength * (max - min));
  return Math.max(min, Math.min(max, val));
}

// --- 勝敗判定（負け時に損失強化付き） ---
async function finalizeGame(gameState, client, combinedPath, interaction, forcedWinner = null) {
  const pythonArgs = [pythonPath, ...gameState.playerHand, ...gameState.botHand, "1", combinedPath];
  const proc = spawn(pythonCmd, pythonArgs);
  let stdout = "";
  proc.stdout.on("data", (d) => (stdout += d.toString()));
  proc.stderr.on("data", (d) => console.error("Python stderr:", d.toString()));

  proc.on("close", async (code) => {
    const userId = interaction.user.id;
    if (code !== 0)
      return interaction.followUp({ content: "❌ 勝敗判定エラー", flags: 64});

    const [winner] = forcedWinner ? [forcedWinner] : stdout.trim().split(",").map((s) => s.trim());
    const bet = Math.max(0, Number(gameState.playerBet || 0));
    const botNorm = evaluateHandStrength(gameState.botHand);
    const botStrength77 = botStrength77to200(botNorm);

    // 勝ち時の計算
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

    const lossMultiplier = 1.8; // ← 負けの時はこれだけ多く失う
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

// --- カード画像生成 ---
async function generateImage(gameState, revealCount, combinedPath) {
  // ターン4以降で全公開
  const isRevealAll = gameState.turn >= 3;
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
