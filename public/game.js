const playerId =
  localStorage.playerId ?? crypto.randomUUID();

localStorage.playerId = playerId;

let game = {
  playerId,
  cookies: 0,
  totalCookies: 0,

  buildings: {
    farm: 0,
    factory: 0,
    lab: 0
  },

  upgrades: {
    clickPower: 1,
    production: 1
  },

  prestige: {
    level: 0,
    points: 0
  }
};


const buildingData = {
  farm: {
    price: 50,
    power: 1
  },

  factory: {
    price: 500,
    power: 10
  },

  lab: {
    price: 5000,
    power: 100
  }
};


async function load() {
  const res = await fetch(
    `/api/cookie/load/${playerId}`
  );

  game = await res.json();
  update();
}


async function save() {
  await fetch(
    "/api/cookie/save",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify(game)
    }
  );
}


function clickCookie() {
  const power = game.upgrades.clickPower;

  game.cookies += power;
  game.totalCookies += power;

  update();
  save();
}


function production() {
  const base =
    game.buildings.farm * 1 +
    game.buildings.factory * 10 +
    game.buildings.lab * 100;

  const boost =
    1 +
    game.upgrades.production * 0.1 +
    game.prestige.points * 0.1;

  return Math.floor(base * boost);
}


setInterval(() => {
  const gain = production();

  game.cookies += gain;
  game.totalCookies += gain;

  update();
  save();

}, 1000);


function buyBuilding(type) {
  const data = buildingData[type];

  if (game.cookies >= data.price) {
    game.cookies -= data.price;
    game.buildings[type]++;

    update();
    save();
  }
}


function buyUpgrade(type) {
  if (type === "click") {
    if (game.cookies >= 100) {
      game.cookies -= 100;
      game.upgrades.clickPower++;
    }
  }

  if (type === "production") {
    if (game.cookies >= 1000) {
      game.cookies -= 1000;
      game.upgrades.production++;
    }
  }

  update();
  save();
}


function rebirth() {
  if (game.cookies < 100000) {
    return;
  }

  game.cookies = 0;

  game.buildings = {
    farm: 0,
    factory: 0,
    lab: 0
  };

  game.upgrades = {
    clickPower: 1,
    production: 1
  };

  game.prestige.points++;
  game.prestige.level++;

  save();
  update();
}


function update() {
  document.getElementById("cookies").textContent =
    `${Math.floor(game.cookies)} Cookie`;

  document.getElementById("production").textContent =
    `毎秒生産: ${production()}`;

  document.getElementById("buildings").textContent =
    `農場:${game.buildings.farm}
工場:${game.buildings.factory}
研究所:${game.buildings.lab}`;

  document.getElementById("upgrades").textContent =
    `クリックLv:${game.upgrades.clickPower}
生産Lv:${game.upgrades.production}`;

  document.getElementById("prestige").textContent =
    `転生:${game.prestige.level}
ポイント:${game.prestige.points}`;
}


document
  .getElementById("cookieButton")
  .onclick = clickCookie;


load();