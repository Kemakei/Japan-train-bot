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
    return interaction.reply({ content: "❌ コインが足りません！", ephemeral: true });

  ongoingGames.set(gameKey, true);
  await interaction.deferReply();

  // --- デッキ構築 ---
  const suits = ["S", "H", "D", "C"];
  const ranks = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const deck = [];
  for (const r of ranks) for (const s of suits) deck.push(r + s);
  deck.sort(() => Math.random() - 0.5);

  const playerHand = deck.splice(0, 5);
  const botHand = deck.splice(0, 5);

  const timestamp = Date.now();
  const combinedPath = path.resolve(__dirname, `../python/images/combined_${userId}_${timestamp}.png`);

  const gameState = {
    turn: 1,
    playerHand,
    botHand,
    deck,
    bet,
    playerBet: bet,
    hasActed: false,
    active: true,
  };

  await client.updateCoins(userId, -bet);
  await generateImage(gameState, 3, combinedPath); // 初期は3枚公開

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
          return btnInt.reply({ content: "❌ コインが足りません！", ephemeral: true });
        gameState.playerBet += add;
        await client.updateCoins(userId, -add);
        await btnInt.reply({ content: `💰 ${add} コインを追加しました（合計ベット: ${gameState.playerBet}）`, ephemeral: true });
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
          return submitted.reply({ content: "❌ 無効な金額です", ephemeral: true });
        if (betValue > userCoins)
          return submitted.reply({ content: "❌ コインが足りません！", ephemeral: true });
        gameState.playerBet += betValue;
        await client.updateCoins(userId, -betValue);
        await submitted.reply({ content: `💰 ${betValue} コインを追加しました`, ephemeral: true });
        return;
      }

      // --- フォールド ---
      if (btnInt.customId === "fold") {
        ongoingGames.delete(gameKey);
        collector.stop("folded");
        await interaction.editReply({
          content: `🏳️ フォールドしました。掛け金を失いました。\n所持金: ${await client.getCoins(userId)}`,
          components: [],
        });
        setTimeout(() => { try { fs.unlinkSync(combinedPath); } catch {} }, 5000);
        return;
      }

      // --- コール ---
      if (btnInt.customId === "call") {
        await btnInt.reply({ content: "📞 コールしました！", ephemeral: true });
        await botTurn(gameState, client, btnInt, combinedPath, interaction, collector);
      }

    } catch (err) {
      console.error(err);
      ongoingGames.delete(gameKey);
      if (!btnInt.replied)
        await btnInt.reply({ content: "❌ エラーが発生しました", ephemeral: true });
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
  if (botStrength > 0.75 && randomFactor < 0.6) decision = "raise";
  else if (botStrength < 0.3 && randomFactor < 0.4) decision = "fold";

  if (decision === "fold") {
    await btnInt.followUp({ content: "🤖 はフォールドしました！あなたの勝ちです。", ephemeral: true });
    collector.stop("folded");
    await finalizeGame(gameState, client, combinedPath, interaction, "player");
    return;
  } else if (decision === "raise") {
    const raiseAmount = Math.floor(1000 + Math.random() * 9000);
    gameState.playerBet += raiseAmount / 2;
    await btnInt.followUp({ content: `🤖 はレイズしました！ (${raiseAmount} コイン)`, ephemeral: true });
  } else {
    await btnInt.followUp({ content: `🤖 はコールしました。`, ephemeral: true });
  }

  await proceedToNextStage(gameState, client, combinedPath, interaction, collector);
}

// --- ターン進行 ---
async function proceedToNextStage(gameState, client, combinedPath, interaction, collector) {
  gameState.turn++;
  const revealCount = gameState.turn === 2 ? 4 : gameState.turn === 3 ? 5 : 5;

  await generateImage(gameState, revealCount, combinedPath);
  const file = new AttachmentBuilder(combinedPath);

  await interaction.editReply({
    content: `🃏 ターン${gameState.turn - 1} 終了。現在のベット: ${gameState.playerBet} コイン`,
    files: [file],
  });

  if (gameState.turn >= 3) {
    collector.stop("completed");
    await finalizeGame(gameState, client, combinedPath, interaction);
  }
}

// --- 勝敗判定 ---
async function finalizeGame(gameState, client, combinedPath, interaction, forcedWinner = null) {
  const pythonArgs = [pythonPath, ...gameState.playerHand, ...gameState.botHand, "1", combinedPath];
  const proc = spawn(pythonCmd, pythonArgs);
  let stdout = "";
  proc.stdout.on("data", (d) => (stdout += d.toString()));
  proc.stderr.on("data", (d) => console.error("Python stderr:", d.toString()));

  proc.on("close", async (code) => {
    const userId = interaction.user.id;
    if (code !== 0)
      return interaction.followUp({ content: "❌ 勝敗判定エラー", ephemeral: true });

    const [winner] = forcedWinner ? [forcedWinner] : stdout.trim().split(",").map((s) => s.trim());
    let msg = "";
    const multiplier = Math.min(5, 1 + (gameState.playerBet / 125000));
    const finalAmount = Math.floor(gameState.playerBet * multiplier);

    if (winner === "player") {
      await client.updateCoins(userId, finalAmount);
      msg = `🎉 勝ち！ +${finalAmount} コイン（倍率 ${multiplier.toFixed(2)}x）`;
    } else if (winner === "bot") {
      await client.updateCoins(userId, -finalAmount);
      msg = `💀 負け！ -${finalAmount} コイン（倍率 ${multiplier.toFixed(2)}x）`;
    } else {
      const refund = Math.floor(gameState.playerBet / 2);
      await client.updateCoins(userId, refund);
      msg = `🤝 引き分け！ +${refund} コイン返却`;
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

// --- 手札強さ判定（0〜1） ---
function evaluateHandStrength(hand) {
  const ranks = "23456789TJQKA";
  return hand.reduce((sum, card) => sum + ranks.indexOf(card[0]), 0) / (13 * hand.length);
}

// --- カード画像生成（turnに応じて公開） ---
async function generateImage(gameState, revealCount, combinedPath) {
  // 🟢 修正版: combine.py は常に 10 枚のカードを要求する
  const args = [
    pythonPath,
    ...gameState.playerHand,
    ...gameState.botHand,
    revealCount === 5 ? "1" : "0",
    combinedPath,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(pythonCmd, args);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Python error (code ${code}): ${stderr}`));
    });
  });
}
