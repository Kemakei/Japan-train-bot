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

  // --- 手札評価（役ベース） ---
  function evaluateHandStrength(hand) {
    const rankValue = { "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"T":10,"J":11,"Q":12,"K":13,"A":14 };
    const ranks = hand.map(c=>c[0]);
    const suits = hand.map(c=>c[1]);
    const values = ranks.map(r=>rankValue[r]).sort((a,b)=>a-b);

    const isFlush = suits.every(s=>s===suits[0]);
    const isStraight = values.every((v,i,a)=>i===0||v===a[i-1]+1) || (values.toString()==="2,3,4,5,14"); // A-2-3-4-5
    const counts = Object.values(ranks.reduce((acc,r)=>{ acc[r]=(acc[r]||0)+1; return acc; }, {})).sort((a,b)=>b-a);

    let rank=0;
    if(isFlush && isStraight && values.includes(14) && values[0]===10) rank=9; // Royal Flush
    else if(isFlush && isStraight) rank=8;
    else if(counts[0]===4) rank=7;
    else if(counts[0]===3 && counts[1]===2) rank=6;
    else if(isFlush) rank=5;
    else if(isStraight) rank=4;
    else if(counts[0]===3) rank=3;
    else if(counts[0]===2 && counts[1]===2) rank=2;
    else if(counts[0]===2) rank=1;
    else rank=0;
    return rank; // 役の強さ
  }

  // --- Bot手札生成 ---
  function drawBotHand(deck, bet){
    const maxBet = 1_000_000;
    const strengthMultiplier = 1 + (Math.min(bet,maxBet)/maxBet)*(30-1);
    const trials = Math.floor(10 + 100*Math.min(1,strengthMultiplier/30));
    const biasFactor = Math.min(1, Math.log10(bet/1000+1)/5);
    const biasRanks = ["T","J","Q","K","A"];
    const biasedDeck = deck.slice().sort((a,b)=>{
      const ra = biasRanks.includes(a[0])?-biasFactor:0;
      const rb = biasRanks.includes(b[0])?-biasFactor:0;
      return ra-rb+(Math.random()-0.5)*0.1;
    });

    let bestHand=null, bestScore=-Infinity;
    for(let i=0;i<trials;i++){
      const temp=[...biasedDeck];
      const hand=temp.splice(0,5);
      const score=evaluateHandStrength(hand)*strengthMultiplier;
      if(score>bestScore){ bestScore=score; bestHand=hand; }
    }

    for(const c of bestHand){
      const idx=deck.indexOf(c);
      if(idx!==-1) deck.splice(idx,1);
    }
    return bestHand;
  }

  // --- デッキ作成 ---
  const suits = ["S","H","D","C"];
  const ranks = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const deck = [];
  for(const r of ranks) for(const s of suits) deck.push(r+s);
  deck.sort(()=>Math.random()-0.5);

  const playerHand = deck.splice(0,5);
  const botHand = drawBotHand(deck,bet);

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
    active:true,
    gameKey,
    finalized:false,
  };

  await client.updateCoins(userId,-bet);
  await generateImage(gameState,3,combinedPath);

  const mkId = (id)=>`${gameKey}:${id}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(mkId("call")).setLabel("コール").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(mkId("fold")).setLabel("フォールド").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(mkId("bet1000")).setLabel("ベット +1000").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(mkId("bet10000")).setLabel("ベット +10000").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(mkId("customBet")).setLabel("💬 ベット指定").setStyle(ButtonStyle.Secondary)
  );

  const file = new AttachmentBuilder(combinedPath);
  await interaction.editReply({
    content:`🎲 あなたの手札です。現在のベット: ${bet} コイン`,
    files:[file],
    components:[row],
  });

  // --- Collector ---
  const filter = i=>i.user.id===userId && i.customId?.startsWith(gameKey+":");
  const collector = interaction.channel.createMessageComponentCollector({ filter, time:90000 });

  async function endGameCleanup(reason,forcedWinner=null){
    if(gameState.finalized) return;
    try{ if(!collector.ended) collector.stop(reason||"completed"); } catch(e){console.error(e);}
    try{ await finalizeGame(gameState,client,combinedPath,interaction,forcedWinner); } catch(e){console.error(e);}
    finally{ ongoingGames.delete(gameKey); }
  }

  collector.on("collect", async btnInt=>{
    try{
      if(gameState.finalized) return btnInt.reply({ content:"このゲームは既に終了しています。", flags:64 });
      const userCoins = await client.getCoins(userId);
      gameState.hasActed = true;
      const [,action] = btnInt.customId.split(":");

      // --- 固定ベット ---
      if(action?.startsWith("bet") && action!=="customBet"){
        const add = action==="bet1000"?1000:10000;
        if(add>userCoins) return btnInt.reply({ content:"❌ コインが足りません！", flags:64 });
        gameState.playerBet+=add;
        gameState.requiredBet=Math.max(gameState.requiredBet,gameState.playerBet);
        await client.updateCoins(userId,-add);
        await btnInt.update({ content:`🎲 あなたの手札です。現在のベット: ${gameState.playerBet} コイン`, files:[new AttachmentBuilder(combinedPath)], components:[row]});
        await btnInt.followUp({ content:`💰 ${add} コインを追加しました（合計ベット: ${gameState.playerBet}）`, ephemeral:true });
        return;
      }

      // --- カスタムベット ---
      if(action==="customBet"){
        const modal = new ModalBuilder().setCustomId(mkId("customBetModal")).setTitle("ベット金額を入力");
        const input = new TextInputBuilder().setCustomId("betAmount").setLabel("ベット金額（整数）").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await btnInt.showModal(modal);

        const submitted = await btnInt.awaitModalSubmit({ time:30000 }).catch(()=>null);
        if(!submitted) return;
        const betValue = Number(submitted.fields.getTextInputValue("betAmount"));
        if(isNaN(betValue)||betValue<=0) return submitted.reply({ content:"❌ 無効な金額です", flags:64 });
        if(betValue>userCoins) return submitted.reply({ content:"❌ コインが足りません！", flags:64 });

        gameState.playerBet+=betValue;
        gameState.requiredBet=Math.max(gameState.requiredBet,gameState.playerBet);
        await client.updateCoins(userId,-betValue);

        await interaction.editReply({ content:`🎲 あなたの手札です。現在のベット: ${gameState.playerBet} コイン`, files:[new AttachmentBuilder(combinedPath)], components:[row] });
        await submitted.reply({ content:`💰 ${betValue} コインを追加しました（合計ベット: ${gameState.playerBet}）`, ephemeral:true });
        return;
      }

      // --- フォールド ---
      if(action==="fold"){
        gameState.active=false;
        await btnInt.update({ content:"🫱 あなたはフォールドしました。🤖 の勝ちです！", components:[] });
        await endGameCleanup("folded","bot");
        return;
      }

      // --- コール ---
      if(action==="call"){
        const callAmount = gameState.requiredBet - gameState.playerBet;
        if(callAmount>0){
          if(callAmount>userCoins) return btnInt.reply({ content:"❌ コインが足りません！", flags:64 });
          await client.updateCoins(userId,-callAmount);
          gameState.playerBet+=callAmount;
        }
        await btnInt.update({ content:"✅ コールしました！", components:[row], files:[new AttachmentBuilder(combinedPath)] });
        await generateImage(gameState,3,combinedPath);
        await interaction.editReply({ content:`🎲 あなたの手札です。現在のベット: ${gameState.playerBet} コイン`, files:[new AttachmentBuilder(combinedPath)], components:[row] });

        gameState.turn++;
        if(gameState.turn===1||gameState.turn===3){
          await botTurn(gameState,client,interaction,combinedPath,row);
        } else if(gameState.turn>4){
          if(!collector.ended) collector.stop("completed");
          await finalizeGame(gameState,client,combinedPath,interaction);
        }
      }

    }catch(err){
      console.error(err);
      ongoingGames.delete(gameKey);
      try{ if(!btnInt.replied) await btnInt.reply({ content:"❌ エラーが発生しました", flags:64 }); } catch{}
    }
  });

  collector.on("end", async (_,reason)=>{
    ongoingGames.delete(gameKey);
    if(!gameState.hasActed){
      await client.updateCoins(userId,gameState.playerBet);
      await interaction.editReply({ content:`⌛ タイムアウト。ベットを返却しました。`, components:[] });
    }
    try{ fs.unlinkSync(combinedPath); } catch{}
  });
}

// --- Bot ターン ---
async function botTurn(gameState,client,interaction,combinedPath,row){
  if(gameState.finalized) return;
  const botStrength = evaluateHandStrength(gameState.botHand);
  let decision="call";
  const rnd=Math.random();
  if(botStrength>0.6 && rnd<0.6) decision="raise";
  else if(botStrength>0.4 && rnd<0.3) decision="raise";
  else if(botStrength<0.3 && rnd<0.1) decision="raise";

  if(decision==="raise"){
    const raiseAmount=Math.floor(1000+Math.random()*9000);
    gameState.requiredBet+=raiseAmount;
    await interaction.followUp({ content:`🤖 はレイズしました！ (+${raiseAmount} コイン)` });
  }else{
    await interaction.followUp({ content:`🤖 はコールしました。` });
  }
}

// --- 勝敗判定 ---
async function finalizeGame(gameState,client,combinedPath,interaction,forcedWinner=null){
  if(gameState.finalized) return;
  gameState.finalized=true;

  const pythonArgs=[pythonPath,...gameState.playerHand,...gameState.botHand,"1",combinedPath];
  const proc=spawn(pythonCmd,pythonArgs);
  let stdout="";
  proc.stdout.on("data",d=>stdout+=d.toString());
  proc.stderr.on("data",d=>console.error(d.toString()));

  proc.on("close",async code=>{
    const userId=interaction.user.id;
    if(code!==0) return interaction.followUp({ content:"❌ 勝敗判定エラー", flags:64 });

    let winner = forcedWinner;
    if(!winner){
      const out = stdout.trim();
      winner = out? out.split(",")[0] : null;
    }
    if(!winner){
      const pScore = evaluateHandStrength(gameState.playerHand);
      const bScore = evaluateHandStrength(gameState.botHand);
      winner = pScore>bScore?"player":(bScore>pScore?"bot":"draw");
    }

    const bet = Math.max(1,gameState.playerBet);
    const botStrength77 = botStrength77to200(evaluateHandStrength(gameState.botHand));

    let msg="";
    if(winner==="player"){
      const reward=Math.round(bet*(1+botStrength77/200));
      await client.updateCoins(userId,reward);
      msg=`🎉 勝ち！ +${reward} コイン（Bot強さ ${botStrength77}）`;
    }else if(winner==="bot"){
      const loss=Math.round(bet*3);
      await client.updateCoins(userId,-loss);
      msg=`💀 負け！ -${loss} コイン（Bot強さ ${botStrength77}）`;
    }else{
      const refund=Math.floor(bet/2);
      await client.updateCoins(userId,refund);
      msg=`🤝 引き分け！ +${refund} コイン返却（Bot強さ ${botStrength77}）`;
    }

    await generateImage(gameState,5,combinedPath);
    const file = new AttachmentBuilder(combinedPath);

    await interaction.editReply({
      content:`${msg}\n🤖 Botの手札: ${gameState.botHand.join(" ")}\n現在の所持金: ${await client.getCoins(userId)}`,
      files:[file],
      components:[],
    });

    setTimeout(()=>{ try{ fs.unlinkSync(combinedPath); } catch{} },5000);
  });
}

// --- Bot 強さ 0〜1 → 77〜200 ---
function botStrength77to200(normStrength){
  return Math.round(77 + Math.min(1,Math.max(0,normStrength))*(200-77));
}

// --- 画像生成 ---
async function generateImage(gameState,revealCount,combinedPath){
  const isRevealAll = revealCount>=5 || gameState.turn>=4;
  const args=[pythonPath,...gameState.playerHand,...gameState.botHand,isRevealAll?"1":"0",combinedPath];

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
