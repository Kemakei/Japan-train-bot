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

  const bet = 1;
  const initialCoins = await client.getCoins(userId);
  if (initialCoins < bet)
    return interaction.reply({ content: "❌ 金コインが足りません！", flags: 64 });

  ongoingGames.set(gameKey, true);
  await interaction.deferReply();

  // --- デッキ作成 ---
  const suits = ["S", "H", "D", "C"];
  const ranks = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const deck = [];
  for (const r of ranks) for (const s of suits) deck.push(r+s);
  deck.sort(() => Math.random() - 0.5);

  const playerHand = deck.splice(0, 5);
  const botHand = deck.splice(0, 5);

  const timestamp = Date.now();
  const combinedPath = path.resolve(__dirname, `../python/images/poker_vip_${userId}_${timestamp}.png`);

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
    finalized: false,
    gameKey
  };

  await client.updateCoins(userId, -bet);
  await generateImage(gameState, 3, combinedPath);

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
    try { if (!collector.ended) collector.stop(reason || "completed"); } catch(e){ console.error(e); }
    try { await finalizeGame(gameState, client, combinedPath, interaction, forcedWinner); } catch(e){ console.error(e); }
    finally { ongoingGames.delete(gameKey); }
  }

  collector.on("collect", async btnInt => {
    try {
      if (gameState.finalized) return btnInt.reply({ content: "このゲームは既に終了しています。", flags: 64 });
      const userCoins = await client.getCoins(userId);
      gameState.hasActed = true;
      const [, action] = btnInt.customId.split(":");

      if (action?.startsWith("bet") && action !== "customBet") {
        const add = action === "bet1" ? 1 : 10;
        if(add > userCoins) return btnInt.reply({ content: "❌ 金コインが足りません！", flags: 64 });
        gameState.playerBet += add;
        gameState.requiredBet = Math.max(gameState.requiredBet, gameState.playerBet);
        await client.updateCoins(userId, -add);
        await btnInt.update({ content: `🎲 あなたの手札です。現在のベット: ${gameState.playerBet} 金コイン`, files:[new AttachmentBuilder(combinedPath)], components:[row] });
        return;
      }

      if(action === "customBet"){
        const modal = new ModalBuilder().setCustomId(mkId("customBetModal")).setTitle("ベット金額を入力");
        const input = new TextInputBuilder().setCustomId("betAmount").setLabel("ベット金額（整数）").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await btnInt.showModal(modal);

        const submitted = await btnInt.awaitModalSubmit({ time: 30000 }).catch(()=>null);
        if(!submitted) return;

        const betValue = Number(submitted.fields.getTextInputValue("betAmount"));
        if(isNaN(betValue) || betValue <=0) return submitted.reply({ content:"❌ 無効な金額です", flags:64 });
        if(betValue > userCoins) return submitted.reply({ content:"❌ 金コインが足りません！", flags:64 });

        gameState.playerBet += betValue;
        gameState.requiredBet = Math.max(gameState.requiredBet, gameState.playerBet);
        await client.updateCoins(userId, -betValue);

        await interaction.editReply({ content:`🎲 あなたの手札です。現在のベット: ${gameState.playerBet} 金コイン`, files:[new AttachmentBuilder(combinedPath)], components:[row] });
        await submitted.reply({ content:`💰 ${betValue} 金コインを追加しました（合計ベット: ${gameState.playerBet}）`, flags:64 });
        return;
      }

      if(action === "fold"){
        gameState.active = false;
        await btnInt.update({ content:"🫱 あなたはフォールドしました。🤖 の勝ちです！", components: [] });
        await endGameCleanup("folded", "bot");
        return;
      }

      if(action === "call"){
        const callAmount = gameState.requiredBet - gameState.playerBet;
        if(callAmount > 0){
          if(callAmount > userCoins) return btnInt.reply({ content:"❌ 金コインが足りません！", flags:64 });
          gameState.playerBet += callAmount;
          await client.updateCoins(userId, -callAmount);
        }

        await btnInt.update({ content:"✅ コールしました！", files:[new AttachmentBuilder(combinedPath)], components:[row] });
        await generateImage(gameState, 5, combinedPath);
        await endGameCleanup("completed");
      }

    } catch(err){
      console.error(err);
      ongoingGames.delete(gameKey);
      try { if(!btnInt.replied) await btnInt.reply({ content:"❌ エラーが発生しました", flags:64 }); } catch{}
    }
  });

  collector.on("end", async (_, reason) => {
    ongoingGames.delete(gameKey);
    if (!gameState.hasActed) {
      await client.updateCoins(userId, gameState.playerBet);
      await interaction.editReply({ content: `⌛ タイムアウト。ベットを返却しました。`, components: [] });
      return;
    }
  });
}

// --- 役判定（名称付き） ---
function getHandRank(hand) {
  const rankOrder = "23456789TJQKA";
  const rankNames = {
    10: "ロイヤルフラッシュ",
    9: "ストレートフラッシュ",
    8: "フォーカード",
    7: "フルハウス",
    6: "フラッシュ",
    5: "ストレート",
    4: "スリーカード",
    3: "ツーペア",
    2: "ワンペア",
    1: "ハイカード"
  };

  const values = hand.map(c => rankOrder.indexOf(c[0]));
  const suits = hand.map(c => c[1]);
  values.sort((a,b)=>a-b);

  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = values.every((v,i,arr) => i===0 || v===arr[i-1]+1)
    || (JSON.stringify(values) === JSON.stringify([0,1,2,3,12])); // A2345

  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.values(counts).sort((a,b)=>b-a);

  let rankValue = 1;
  if (isStraight && isFlush && values[4] === 12) rankValue = 10;
  else if (isStraight && isFlush) rankValue = 9;
  else if (groups[0] === 4) rankValue = 8;
  else if (groups[0] === 3 && groups[1] === 2) rankValue = 7;
  else if (isFlush) rankValue = 6;
  else if (isStraight) rankValue = 5;
  else if (groups[0] === 3) rankValue = 4;
  else if (groups[0] === 2 && groups[1] === 2) rankValue = 3;
  else if (groups[0] === 2) rankValue = 2;

  return {
    rankValue,
    rankName: rankNames[rankValue],
  };
}

function evaluateHandStrength(hand) {
  const { rankValue } = getHandRank(hand);
  return rankValue / 10; // normalize to 0〜1
}

function botStrength77to200(normStrength) {
  return Math.round(77 + normStrength * (200 - 77));
}

function calculatePlayerReward(baseBet, botStrength) {
  const norm = (botStrength - 77) / (200 - 77);
  return Math.round(baseBet * (2 + norm * (5 - 2)));
}

// --- 勝敗判定 ---
async function finalizeGame(gameState, client, combinedPath, interaction, forcedWinner = null) {
  if (gameState.finalized) return;
  gameState.finalized = true;

  const userId = interaction.user.id;
  let winner = forcedWinner;

  const pEval = getHandRank(gameState.playerHand);
  const bEval = getHandRank(gameState.botHand);

  if (!winner) {
    winner = pEval.rankValue > bEval.rankValue ? "player" :
             bEval.rankValue > pEval.rankValue ? "bot" : "draw";
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
    content: `${msg}\n🂡 あなたの役: **${pEval.rankName}**\n🤖 Bot手札: ${gameState.botHand.join(" ")}\n現在の金コイン: ${currentCoins}`,
    files: [file],
    components: []
  });

  setTimeout(() => { try { fs.unlinkSync(combinedPath); } catch {} }, 5000);
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
