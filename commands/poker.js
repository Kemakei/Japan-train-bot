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

// --- ゲーム進行状況管理（チャンネル×ユーザー単位） ---
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
      content: "❌ このチャンネルで進行中のゲームがあります！",
      ephemeral: true,
    });
  }

  const initialCoins = await client.getCoins(userId);
  let bet = 1000;
  if (initialCoins < bet)
    return interaction.reply({ content: "❌ コインが足りません！", ephemeral: true });

  await interaction.deferReply();

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
    turn: 0,
    playerHand,
    botHand,
    deck,
    bet,
    pot: bet * 2,
    playerBet: bet,
    botBet: bet,
    currentCallAmount: bet,
    hasActed: false,
    active: true,
  };

  // プレイヤーの掛け金を先に引く
  await client.updateCoins(userId, -bet);

  try {
    // 初回画像生成を安全に行う
    await generateImage(gameState, 2, combinedPath);

    // 生成成功したらゲーム登録
    ongoingGames.set(gameKey, true);

    // 最初のステージ表示
    await showGameStage(interaction, gameState, combinedPath);
  } catch (err) {
    console.error(err);
    await interaction.editReply({ content: "❌ ゲーム開始時にエラーが発生しました。", components: [] });
    try { fs.unlinkSync(combinedPath); } catch {}
    return;
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("call").setLabel("コール").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("fold").setLabel("フォールド").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("bet100").setLabel("ベット +100").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("bet1000").setLabel("ベット +1000").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("bet10000").setLabel("ベット +10000").setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("customBet").setLabel("💬 ベット指定").setStyle(ButtonStyle.Secondary)
  );

  const collector = interaction.channel.createMessageComponentCollector({
    filter: (i) => i.user.id === userId,
    time: 90000
  });

  collector.on("collect", async (btnInt) => {
    try {
      const userCoins = await client.getCoins(userId);
      gameState.hasActed = true;

      // 固定ベット
      if (btnInt.customId.startsWith("bet")) {
        const add =
          btnInt.customId === "bet100" ? 100 :
          btnInt.customId === "bet1000" ? 1000 :
          btnInt.customId === "bet10000" ? 10000 : 0;

        if (add > userCoins)
          return btnInt.reply({ content: "❌ コインが足りません！", ephemeral: true });

        gameState.bet += add;
        gameState.playerBet += add;
        gameState.pot += add;
        await client.updateCoins(userId, -add);

        return btnInt.reply({ content: `💰 ${add} コインを追加しました（合計ベット: ${gameState.playerBet}）`, ephemeral: true });
      }

      // カスタムベット
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

        const coins = await client.getCoins(userId);
        if (betValue > coins)
          return submitted.reply({ content: "❌ コインが足りません！", ephemeral: true });

        gameState.bet += betValue;
        gameState.playerBet += betValue;
        gameState.pot += betValue;
        await client.updateCoins(userId, -betValue);
        return submitted.reply({ content: `💰 ${betValue} コインを追加しました`, ephemeral: true });
      }

      // フォールド
      if (btnInt.customId === "fold") {
        ongoingGames.delete(gameKey);
        collector.stop("folded");
        const refund = Math.floor(gameState.bet / 2);
        await client.updateCoins(userId, refund);
        await interaction.editReply({
          content: `🏳️ フォールドしました。掛け金の半分(${refund} コイン)を返却しました。\n現在の所持金: ${await client.getCoins(userId)}`,
          components: [],
        });
        try { fs.unlinkSync(combinedPath); } catch {}
        return;
      }

      // コール
      if (btnInt.customId === "call") {
        if (gameState.playerBet < gameState.currentCallAmount) {
          return btnInt.reply({ content: "❌ まずレイズされた分をベットしてください！", ephemeral: true });
        }

        await btnInt.reply({ content: "📞 コールしました！", ephemeral: true });
        await botTurn(gameState, client, btnInt);
      }

    } catch (err) {
      console.error(err);
      ongoingGames.delete(gameKey);
      if (!btnInt.replied)
        await btnInt.reply({ content: "❌ 予期せぬエラーが発生しました", ephemeral: true });
    }
  });

  collector.on("end", async (_, reason) => {
    ongoingGames.delete(gameKey);
    if (!gameState.hasActed) {
      await client.updateCoins(userId, gameState.bet);
      await interaction.editReply({ content: `⌛ タイムアウト。ベットを返却しました。`, components: [] });
      try { fs.unlinkSync(combinedPath); } catch {}
    }
  });
}

// --- 段階表示 ---
async function showGameStage(interaction, gameState, combinedPath) {
  const stageCards = [
    { name: "プリフロップ", reveal: 2 },
    { name: "フロップ", reveal: 3 },
    { name: "ターン", reveal: 4 },
    { name: "リバー", reveal: 5 }
  ];
  const stage = stageCards[gameState.turn];
  await generateImage(gameState, stage.reveal, combinedPath);
  const file = new AttachmentBuilder(combinedPath);

  await interaction.editReply({
    content: `🃏 ${stage.name} カード公開中\n現在のポット: ${gameState.pot}`,
    files: [file]
  });
}

// --- Botターン ---
async function botTurn(gameState, client, lastInteraction) {
  const botStrength = evaluateHandStrength(gameState.botHand);
  const shouldBluff = Math.random() < 0.25;

  let decision = "call";
  let raiseAmount = 0;

  if (shouldBluff && Math.random() < 0.5) {
    decision = "raise";
    raiseAmount = 10000 + Math.floor(Math.random() * 20000);
  } else if (botStrength > 0.8) {
    decision = Math.random() < 0.7 ? "raise" : "call";
    raiseAmount = Math.random() < 0.5 ? 5000 : 30000;
  } else if (botStrength > 0.5) {
    decision = Math.random() < 0.4 ? "raise" : "call";
    raiseAmount = Math.random() < 0.5 ? 2000 : 10000;
  }

  if (decision === "raise") {
    await lastInteraction.followUp({ content: `🤖 レイズしました: ${raiseAmount} コイン`, ephemeral: true });
    gameState.currentCallAmount = Math.max(gameState.currentCallAmount, raiseAmount);
  } else {
    await lastInteraction.followUp({ content: `🤖 コールしました。`, ephemeral: true });
  }

  // ターン進行
  gameState.turn++;
  if (gameState.turn > 3) {
    await finalizeGame(gameState, client, lastInteraction);
    return;
  }
  await showGameStage(lastInteraction, gameState, path.resolve(__dirname, `../python/images/combined_${lastInteraction.user.id}_${Date.now()}.png`));
}

// --- 勝敗判定（倍率ルール） ---
async function finalizeGame(gameState, client, interaction) {
  const combinedPath = path.resolve(__dirname, `../python/images/combined_${interaction.user.id}_${Date.now()}.png`);
  const playerArg = [...gameState.playerHand];
  const botArg = [...gameState.botHand];

  while (playerArg.length < 5) playerArg.push("XX");
  while (botArg.length < 5) botArg.push("XX");

  const pythonArgs = [pythonPath, ...playerArg, ...botArg, "1", combinedPath];
  const proc = spawn(pythonCmd, pythonArgs);

  let stdout = "";
  proc.stdout.on("data", (d) => (stdout += d.toString()));
  proc.stderr.on("data", (d) => console.error("Python stderr:", d.toString()));

  proc.on("close", async (code) => {
    if (code !== 0)
      return interaction.followUp({ content: "❌ 勝敗判定エラー", ephemeral: true });

    const [winner] = stdout.trim().split(",").map(s => s.trim());
    let msg = "";
    let delta = 0;
    const maxMultiplier = 5;
    const maxCoin = 500000;

    if (winner === "player") {
      delta = Math.min(gameState.bet * maxMultiplier, maxCoin);
      await client.updateCoins(interaction.user.id, delta);
      msg = `🎉 勝ち！ +${delta} コイン`;
    } else if (winner === "bot") {
      delta = -Math.min(gameState.bet * maxMultiplier, maxCoin);
      await client.updateCoins(interaction.user.id, delta);
      msg = `💀 負け！ ${-delta} コイン失いました`;
    } else {
      delta = Math.floor(gameState.bet / 2);
      await client.updateCoins(interaction.user.id, delta);
      msg = `🤝 引き分け！ +${delta} コイン返却`;
    }

    ongoingGames.delete(`${interaction.channelId}-${interaction.user.id}`);

    await interaction.editReply({
      content: `${msg}\n現在の所持金: ${await client.getCoins(interaction.user.id)}`,
      components: []
    });

    try { fs.unlinkSync(combinedPath); } catch {}
  });
}

// --- 手札強さ判定 ---
function evaluateHandStrength(hand) {
  const ranks = "23456789TJQKA";
  return hand.reduce((sum, c) => sum + ranks.indexOf(c[0]), 0) / (13 * hand.length);
}

// --- 画像生成 ---
async function generateImage(gameState, revealCount, combinedPath) {
  const args = [
    pythonPath,
    ...gameState.playerHand.slice(0, revealCount).concat(Array(5-revealCount).fill("XX")),
    ...gameState.botHand.slice(0, revealCount).concat(Array(5-revealCount).fill("XX")),
    revealCount === 5 ? "1" : "0",
    combinedPath
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
