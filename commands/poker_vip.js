import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageAttachment,
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

  const timestamp = Date.now();
  const combinedPath = path.resolve(__dirname, `../python/images/combined_${userId}_${timestamp}.png`);

  const gameState = {
    turn:0,
    playerHand,
    botHand,
    deck,
    bet,
    playerBet: bet,
    requiredBet: bet,
    hasActed:false,
    active:true
  };

  await client.updateCoins(userId, -bet);
  await generateImage(gameState,3,combinedPath);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("call").setLabel("コール").setStyle(ButtonStyle.SUCCESS),
    new ButtonBuilder().setCustomId("fold").setLabel("フォールド").setStyle(ButtonStyle.DANGER),
    new ButtonBuilder().setCustomId("bet1000").setLabel("ベット +1000").setStyle(ButtonStyle.PRIMARY),
    new ButtonBuilder().setCustomId("bet10000").setLabel("ベット +10000").setStyle(ButtonStyle.PRIMARY),
    new ButtonBuilder().setCustomId("customBet").setLabel("💬 ベット指定").setStyle(ButtonStyle.SECONDARY)
  );

  const file = new MessageAttachment(combinedPath);
  await interaction.editReply({ content:`🎲 あなたの手札です。現在のベット: ${bet} 金コイン`, files:[file], components:[row] });

  const filter = i => i.user.id === userId;
  const collector = interaction.channel.createMessageComponentCollector({ filter, time: 90000 });

  collector.on("collect", async btnInt => {
    try {
      const userCoins = await client.getCoins(userId);
      gameState.hasActed = true;

      // 固定ベット
      if(btnInt.customId.startsWith("bet")){
        const add = btnInt.customId==="bet1000"?1000:10000;
        if(add>userCoins) return btnInt.reply({content:"❌ 金コインが足りません！", flags:64});
        gameState.playerBet+=add;
        gameState.requiredBet=Math.max(gameState.requiredBet, gameState.playerBet);
        await client.updateCoins(userId,-add);
        await interaction.editReply({content:`🎲 あなたの手札です。現在のベット: ${gameState.playerBet} 金コイン`, components:[btnInt.message.components[0]]});
        await btnInt.reply({content:`💰 ${add} 金コインを追加しました（合計ベット: ${gameState.playerBet}）`, flags:64});
        return;
      }

      // カスタムベット
      if(btnInt.customId==="customBet"){
        const modal = new ModalBuilder().setCustomId("customBetModal").setTitle("ベット金額を入力");
        const input = new TextInputBuilder().setCustomId("betAmount").setLabel("ベット金額（整数）").setStyle(TextInputStyle.SHORT).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await btnInt.showModal(modal);
        const submitted = await btnInt.awaitModalSubmit({time:30000}).catch(()=>null);
        if(!submitted) return;
        const betValue = Number(submitted.fields.getTextInputValue("betAmount"));
        if(isNaN(betValue)||betValue<=0) return submitted.reply({content:"❌ 無効な金額です", flags:64});
        if(betValue>userCoins) return submitted.reply({content:"❌ 金コインが足りません！", flags:64});
        gameState.playerBet+=betValue;
        gameState.requiredBet=Math.max(gameState.requiredBet, gameState.playerBet);
        await client.updateCoins(userId,-betValue);
        await interaction.editReply({content:`🎲 あなたの手札です。現在のベット: ${gameState.playerBet} 金コイン`, components:[submitted.message.components[0]]});
        await submitted.reply({content:`💰 ${betValue} 金コインを追加しました（合計ベット: ${gameState.playerBet}）`, flags:64});
        return;
      }

      // フォールド
      if(btnInt.customId==="fold"){
        gameState.active=false;
        collector.stop("folded");
        await interaction.editReply({content:"🫱 あなたはフォールドしました。🤖 の勝ちです！", components:[]});
        await finalizeGame(gameState, client, combinedPath, interaction,"bot");
        return;
      }

      // コール
      if(btnInt.customId==="call"){
        if(gameState.playerBet<gameState.requiredBet)
          return btnInt.reply({content:`❌ レイズ額が未払いです。最低 ${gameState.requiredBet} 金コインまでベットしてください`, flags:64});
        await btnInt.reply({content:"📞 コールしました！", flags:64});
        await botTurn(gameState, client, btnInt, combinedPath, interaction, collector);
      }

    } catch(err){
      console.error(err);
      ongoingGames.delete(gameKey);
      if(!btnInt.replied) await btnInt.reply({content:"❌ エラーが発生しました", flags:64});
    }
  });

  collector.on("end", async (_, reason)=>{
    ongoingGames.delete(gameKey);
    if(!gameState.hasActed){
      await client.updateCoins(userId, gameState.playerBet);
      await interaction.editReply({content:`⌛ タイムアウト。ベットを返却しました。`, components:[]});
      setTimeout(()=>{try{fs.unlinkSync(combinedPath);}catch{}},5000);
    }
  });
}

// --- Botターン ---
async function botTurn(gameState, client, btnInt, combinedPath, interaction, collector){
  const botNorm = evaluateHandStrength(gameState.botHand);
  let decision = Math.random()<0.5?"call":"raise";
  if(decision==="raise"){
    const raiseAmount = Math.floor(1000+Math.random()*9000);
    gameState.requiredBet+=raiseAmount;
    await interaction.followUp({content:`🤖 はレイズしました！ (${raiseAmount} 金コイン)`});
  }else{
    await interaction.followUp({content:`🤖 はコールしました。`});
  }
  await proceedToNextStage(gameState, client, combinedPath, interaction, collector);
}

// --- ターン進行 ---
async function proceedToNextStage(gameState, client, combinedPath, interaction, collector){
  let revealCount = gameState.turn===0?3:gameState.turn===1?4:5;
  await generateImage(gameState,revealCount,combinedPath);
  const file = new MessageAttachment(combinedPath);
  await interaction.editReply({content:`🃏 ターン${gameState.turn+1} 終了。現在のベット: ${gameState.playerBet} 金コイン`, files:[file]});
  gameState.turn++;
  if(gameState.turn>=3){
    collector.stop("completed");
    await finalizeGame(gameState, client, combinedPath, interaction);
  }
}

// --- 勝敗判定 ---
async function finalizeGame(gameState, client, combinedPath, interaction, forcedWinner=null){
  const pythonArgs=[pythonPath,...gameState.playerHand,...gameState.botHand,"1",combinedPath];
  const proc=spawn(pythonCmd,pythonArgs);
  let stdout="";
  proc.stdout.on("data",d=>stdout+=d.toString());
  proc.stderr.on("data",d=>console.error("Python stderr:",d.toString()));
  proc.on("close",async code=>{
    const userId=interaction.user.id;
    if(code!==0) return interaction.followUp({content:"❌ 勝敗判定エラー", flags:64});
    const [winner]=forcedWinner?[forcedWinner]:stdout.trim().split(",").map(s=>s.trim());
    const bet = Math.max(1, gameState.playerBet || 1);
    const botStrength = calcBotStrength(bet); // 2〜5

    let msg = "";

    if (winner === "player") {
    const gain = Math.floor(bet * botStrength);
    await client.updateCoins(userId, gain);
    msg = `🎉 勝ち！ +${gain} 金コイン（Bot強さ×${botStrength.toFixed(2)}）`;
    } else if (winner === "bot") {
    const loss = Math.floor(bet * (6 - botStrength)); // 強いほど失う量は減る
    await client.updateCoins(userId, -loss);

    // 所持金が0未満になったら0に補正
    const current = await client.getCoins(userId);
    if (current < 0) await client.setCoins(userId, 0);

    msg = `💀 負け！ -${loss} 金コイン（Bot強さ×${botStrength.toFixed(2)}）`;
    } else {
    const refund = Math.floor(bet / 2);
    await client.updateCoins(userId, refund);
    msg = `🤝 引き分け！ +${refund} 金コイン返却`;
    }


    await generateImage(gameState,5,combinedPath);
    const file = new MessageAttachment(combinedPath);
    const currentCoins = await client.getCoins(userId);
    await interaction.editReply({content:`${msg}\n🤖 Bot手札: ${gameState.botHand.join(" ")}\n現在の金コイン: ${currentCoins}`, files:[file], components:[]});
    setTimeout(()=>{try{fs.unlinkSync(combinedPath);}catch{}},5000);
  });
}

// --- 手札強さ評価 ---
function evaluateHandStrength(hand){
  const ranks="23456789TJQKA";
  let score=0;
  const rankCounts={};
  const suits={};
  for(const card of hand){
    const rank=card[0];
    const suit=card[1];
    rankCounts[rank]=(rankCounts[rank]||0)+1;
    suits[suit]=(suits[suit]||0)+1;
    score+=ranks.indexOf(rank);
  }
  const pairs=Object.values(rankCounts).filter(v=>v===2).length;
  const trips=Object.values(rankCounts).filter(v=>v===3).length;
  const flush=Object.values(suits).some(v=>v>=4);
  if(pairs) score+=10*pairs;
  if(trips) score+=25;
  if(flush) score+=30;
  return Math.min(1,score/120);
}

// --- 画像生成 ---
async function generateImage(gameState,revealCount,combinedPath){
  const args=[pythonPath,...gameState.playerHand,...gameState.botHand,revealCount===5&&gameState.turn>=2?"1":"0",combinedPath];
  return new Promise((resolve,reject)=>{
    const proc=spawn(pythonCmd,args);
    let stderr="";
    proc.stderr.on("data",d=>stderr+=d.toString());
    proc.on("close",code=>{
      if(code===0) resolve();
      else reject(new Error(`Python error (code ${code}): ${stderr}`));
    });
  });
}
