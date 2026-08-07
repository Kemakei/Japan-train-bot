let bossHP=1000;

document.getElementById("player").onclick=()=>{
createArrow();
};

function createArrow(){
const arrow=document.createElement("div");
arrow.className="arrow";
document.getElementById("battle").appendChild(arrow);

setTimeout(()=>{
attack();
arrow.remove();
},600);
}

function attack(){
bossHP-=10;
if(bossHP<0)bossHP=0;

document.getElementById("hp").textContent=bossHP;

if(bossHP===0){
alert("敵を倒した");
}
}