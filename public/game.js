const canvas=document.getElementById("game");
const ctx=canvas.getContext("2d");

const tileSize=32;

let map;
let tiles={};

const player={
  x:100,
  y:100,
  speed:3,
  size:32
};

const keys={};

document.addEventListener("keydown",e=>{
  keys[e.key]=true;
});

document.addEventListener("keyup",e=>{
  keys[e.key]=false;
});

async function loadGame(){
  map=await fetch("assets/json/map.json")
    .then(response=>response.json());

  tiles.grass=new Image();
  tiles.grass.src="assets/tiles/草.tsx";

  tiles.dirt=new Image();
  tiles.dirt.src="assets/tiles/土.tsx";

  tiles.grass.onload=()=>{
    requestAnimationFrame(gameLoop);
  };
}

function drawMap(){
  const layer=map.layers[0];

  for(let i=0;i<layer.data.length;i++){
    const tile=layer.data[i];

    const x=(i%map.width)*tileSize;
    const y=Math.floor(i/map.width)*tileSize;

    if(tile===1){
      ctx.drawImage(
        tiles.grass,
        x,
        y,
        tileSize,
        tileSize
      );
    }

    if(tile===5){
      ctx.drawImage(
        tiles.dirt,
        x,
        y,
        tileSize,
        tileSize
      );
    }
  }
}

function updatePlayer(){

if(keys["ArrowUp"]||keys["w"]||joystick.y<-0.3){
player.y-=player.speed;
}

if(keys["ArrowDown"]||keys["s"]||joystick.y>0.3){
player.y+=player.speed;
}

if(keys["ArrowLeft"]||keys["a"]||joystick.x<-0.3){
player.x-=player.speed;
}

if(keys["ArrowRight"]||keys["d"]||joystick.x>0.3){
player.x+=player.speed;
}

}

function drawPlayer(){
  ctx.fillStyle="red";

  ctx.fillRect(
    player.x,
    player.y,
    player.size,
    player.size
  );
}

function gameLoop(){
  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  updatePlayer();
  drawMap();
  drawPlayer();

  requestAnimationFrame(gameLoop);
}

let joystickEnabled=true;

let joystick={
x:0,
y:0
};

const joystickArea=document.getElementById("joystick");
const stick=document.getElementById("stick");
const toggle=document.getElementById("joystickToggle");


toggle.addEventListener("click",()=>{

joystickEnabled=!joystickEnabled;

joystickArea.style.display=
joystickEnabled?"block":"none";

toggle.textContent=
joystickEnabled?
"Joystick OFF":
"Joystick ON";

});

let touchStart={
x:0,
y:0
};


joystickArea.addEventListener(
"touchstart",
e=>{

const touch=e.touches[0];

touchStart.x=touch.clientX;
touchStart.y=touch.clientY;

},
{passive:false}
);


joystickArea.addEventListener(
"touchmove",
e=>{

e.preventDefault();

const touch=e.touches[0];

let dx=
touch.clientX-touchStart.x;

let dy=
touch.clientY-touchStart.y;


const limit=40;


dx=Math.max(
-limit,
Math.min(limit,dx)
);

dy=Math.max(
-limit,
Math.min(limit,dy)
);


stick.style.left=
40+dx+"px";

stick.style.top=
40+dy+"px";


joystick.x=
dx/limit;

joystick.y=
dy/limit;

},
{passive:false}
);


joystickArea.addEventListener(
"touchend",
()=>{

stick.style.left="40px";
stick.style.top="40px";

joystick.x=0;
joystick.y=0;

});

loadGame();