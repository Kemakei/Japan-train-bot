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
  .setDescription("Botと4ターン制ポーカーで勝負！");

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
  let bet = 1000;
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
  let botHand = deck.splice(0, 5);

  const timestamp = Date.now();
  const combinedPath = path.resolve(__dirname, `../python/images/combined_${userId}_${timestamp}.png`);

  const gameState = {
    turn: 1,
    playerHand,
    botHand,
    deck,
    bet,
    pot: bet * 2, // 初期は両者1000ずつ
    playerBet: bet,
    botBet: bet,
    currentCallAmount: bet,
    hasActed: false,
    active: true,
  };

  await client.updateCoins(userId, -bet);

  await generateImage(gameState, 0, combinedPath);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("call").setLabel("コール").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("fold").setLabel("フォールド").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("bet100").setLabel("ベット +100").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("bet1000").setLabel("ベット +1000").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("bet10000").setLabel("ベット +10000").setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("customBet").setLabel("💬 ベット指定").setStyle(ButtonStyle.Secondary),
  );

  const file = new AttachmentBuilder(combinedPath);
  await interaction.editReply({
    content: `🎲 あなたの手札です。現在のベット: ${bet} コイン`,
    files: [file],
    components: [row, row2],
  });

  const filter = (i) => i.user.id === userId;
  const collector = interaction.channel.createMessageComponentCollector({ filter, time: 90000 });

  collector.on("collect", async (btnInt) => {
    try {
      const userCoins = await client.getCoins(userId);
      gameState.hasActed = true;

      // --- ベット額調整 ---
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

        const coins = await client.getCoins(userId);
        if (betValue > coins)
          return submitted.reply({ content: "❌ コインが足りません！", ephemeral: true });

        gameState.bet += betValue;
        gameState.playerBet += betValue;
        gameState.pot += betValue;
        await client.updateCoins(userId, -betValue);
        await submitted.reply({ content: `💰 ${betValue} コインを追加しました`, ephemeral: true });
        return;
      }

      // --- フォールド ---
      if (btnInt.customId === "fold") {
        ongoingGames.delete(gameKey);
        collector.stop("folded");
        const refund = 0; // 全損
        await interaction.editReply({
          content: `🏳️ フォールドしました。すべてのベットを失いました。\n所持金: ${await client.getCoins(userId)}`,
          components: [],
        });
        try { fs.unlinkSync(combinedPath); } catch {}
        return;
      }

      // --- コール ---
      if (btnInt.customId === "call") {
        // 差額チェック
        if (gameState.playerBet < gameState.currentCallAmount) {
          return btnInt.reply({
            content: "❌ まずレイズされた金額分ベットしてください！",
            ephemeral: true,
          });
        }

        await btnInt.reply({ content: "📞 コールしました！", ephemeral: true });

        await botTurn(gameState, client, combinedPath, interaction, btnInt);
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
      await client.updateCoins(userId, gameState.bet); // 全額返却
      await interaction.editReply({ content: `⌛ タイムアウト。ベットを返却しました。`, components: [] });
      try { fs.unlinkSync(combinedPath); } catch {}
    }
  });
}

async function botTurn(gameState, client, combinedPath, interaction, lastInteraction) {
  const { deck } = gameState;
  const botStrength = evaluateHandStrength(gameState.botHand);
  const bluffChance = 0.15 + Math.random() * 0.25; // 15〜40%の確率でブラフ
  const shouldBluff = Math.random() < bluffChance;

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
  } else if (Math.random() < 0.1) {
    decision = "raise";
    raiseAmount = 2000 + Math.floor(Math.random() * 8000);
  }

  if (decision === "raise") {
    gameState.botBet += raiseAmount;
    gameState.pot += raiseAmount;
    gameState.currentCallAmount = Math.max(gameState.currentCallAmount, gameState.botBet);
    await lastInteraction.followUp({ content: `🤖 はレイズしました！ +${raiseAmount} コイン（合計: ${gameState.botBet}）` });
  } else {
    const toCallForBot = Math.max(0, gameState.currentCallAmount - gameState.botBet);
    gameState.botBet += toCallForBot;
    gameState.pot += toCallForBot;
    await lastInteraction.followUp({ content: `🤖 はコールしました（${toCallForBot} を加えました）。` });
  }

  await proceedToNextStage(gameState, client, combinedPath, interaction, lastInteraction);
}

async function proceedToNextStage(gameState, client, combinedPath, interaction, btnInt) {
  gameState.turn++;

  if (gameState.turn > 4) {
    await finalizeGame(gameState, client, combinedPath, interaction);
    return;
  }

  await generateImage(gameState, gameState.turn - 1, combinedPath);

  const file = new AttachmentBuilder(combinedPath);
  await interaction.editReply({
    content: `🃏 ターン${gameState.turn - 1} 終了。次のカードが公開されました！\n現在のポット: ${gameState.pot}`,
    files: [file],
  });
}

async function finalizeGame(gameState, client, combinedPath, interaction) {
  const pythonArgs = [pythonPath, ...gameState.playerHand, ...gameState.botHand, "1", combinedPath];
  const proc = spawn(process.platform === "win32" ? "py" : "python3", pythonArgs);

  let stdout = "";
  proc.stdout.on("data", (d) => (stdout += d.toString()));
  proc.stderr.on("data", (d) => console.error("Python stderr:", d.toString()));

  proc.on("close", async (code) => {
    if (code !== 0)
      return interaction.followUp({ content: "❌ 勝敗判定エラー", ephemeral: true });

    const [winner] = stdout.trim().split(",").map((s) => s.trim());
    let msg = "";
    const multiplier = Math.min(5, 1 + gameState.bet / 100000);
    let amount = 0;

    if (winner === "player") {
      amount = Math.floor(gameState.bet * multiplier);
      await client.updateCoins(interaction.user.id, amount);
      msg = `🎉 勝ち！ +${amount} コイン`;
    } else if (winner === "bot") {
      msg = `💀 負け！`;
    } else {
      amount = Math.floor(gameState.bet / 2);
      await client.updateCoins(interaction.user.id, amount);
      msg = `🤝 引き分け！ +${amount} コイン返却`;
    }

    await interaction.editReply({ content: `${msg}\n現在の所持金: ${await client.getCoins(interaction.user.id)}`, components: [] });
    try { fs.unlinkSync(combinedPath); } catch {}
  });
}

function evaluateHandStrength(hand) {
  const ranks = "23456789TJQKA";
  return hand.reduce((sum, card) => sum + ranks.indexOf(card[0]), 0) / (13 * hand.length);
}

async function generateImage(gameState, revealLevel, combinedPath) {
  return new Promise((resolve, reject) => {
    const args = [pythonPath, ...gameState.playerHand, ...gameState.botHand, revealLevel.toString(), combinedPath];
    const proc = spawn(pythonCmd, args);
    proc.on("close", (code) => (code === 0 ? resolve() : reject()));
  });
}
