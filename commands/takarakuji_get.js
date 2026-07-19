import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getLatestDrawId } from "../utils/draw.js";

export const data=new SlashCommandBuilder()
.setName("takarakuji_get")
.setDescription("購入した宝くじの当選結果を確認します");

export async function execute(interaction){
const userId=interaction.user.id;
const {lotteryTickets,updateCoins,getCoins}=interaction.client;
await interaction.deferReply();

const latestDrawId=getLatestDrawId(new Date());

const cursor=lotteryTickets.find(
{userId,claimed:false},
{
projection:{
_id:1,
number:1,
letter:1,
prize:1,
rank:1,
drawId:1,
isWin:1
}
}
).batchSize(5000);

let hasPurchase=false;
let totalPrize=0;
let winCount=0;
let unpublishedCount=0;

const publicLines=[];
const lowRankWins={};
const deleteIds=[];

for await(const p of cursor){
hasPurchase=true;

if(!p.drawId||p.drawId>latestDrawId){
unpublishedCount++;
continue;
}

if(p.isWin){
totalPrize+=p.prize;
winCount++;

if(p.rank<=3){
if(publicLines.length<100){
publicLines.push(`🎟 ${p.number}${p.letter} → 🏆 ${p.rank}等 💰 ${p.prize.toLocaleString()}コイン獲得！`);
}else if(publicLines.length===100){
publicLines.push("他省略");
}
}else{
if(!lowRankWins[p.rank]){
lowRankWins[p.rank]={count:0,prize:p.prize};
}
lowRankWins[p.rank].count++;
}
}

deleteIds.push(p._id);
}

if(!hasPurchase){
return interaction.editReply({
embeds:[
new EmbedBuilder()
.setTitle("❌ 購入履歴なし")
.setDescription("現在、あなたの購入履歴はありません。")
.setColor(0xff0000)
]
});
}

if(deleteIds.length){
await lotteryTickets.deleteMany({_id:{$in:deleteIds}});
}

if(totalPrize>0){
await updateCoins(userId,totalPrize);
}

const coins=await getCoins(userId);

for(const rank of Object.keys(lowRankWins).sort((a,b)=>a-b)){
const d=lowRankWins[rank];
publicLines.push(`🏆 ${rank}等: ${d.count.toLocaleString()}枚 × ${d.prize.toLocaleString()}コイン`);
}

const embeds=[];

if(publicLines.length){
for(let i=0;i<publicLines.length;i+=50){
embeds.push(
new EmbedBuilder()
.setTitle("🎉 当選結果")
.setDescription(publicLines.slice(i,i+50).join("\n"))
.setColor(0xffd700)
);
}
embeds[embeds.length-1].setFooter({
text:`🎟 当選チケット: ${winCount} | 💰 合計当選金額: ${totalPrize.toLocaleString()}コイン | 所持金: ${coins.toLocaleString()}コイン`
});
}

if(unpublishedCount>0&&!publicLines.length){
embeds.push(
new EmbedBuilder()
.setTitle("⏳ 未公開の抽選")
.setDescription(`未公開チケット: ${unpublishedCount.toLocaleString()}枚`)
.setColor(0xaaaaaa)
);
}

if(!publicLines.length&&unpublishedCount===0){
embeds.push(
new EmbedBuilder()
.setTitle("📭 当選結果なし")
.setDescription(`当選したチケットはありませんでした。\n合計当選金額: ${totalPrize.toLocaleString()}コイン\n所持金: ${coins.toLocaleString()}コイン`)
.setColor(0x888888)
);
}

await Promise.all(embeds.map(e=>interaction.followUp({embeds:[e]})));
}