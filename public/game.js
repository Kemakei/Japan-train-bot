const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let mapData = null;
let tilesetImage = new Image();

async function loadMap() {
  const response = await fetch('assets/map.json');
  mapData = await response.json();

  const tileset = mapData.tilesets[0];
  tilesetImage.src = tileset.image;

  tilesetImage.onload = () => {
    drawMap();
  };
}


function drawMap() {
  const tileWidth = mapData.tilewidth;   
  const tileHeight = mapData.tileheight; 
  const mapWidth = mapData.width;        

  mapData.layers.forEach(layer => {
    if (layer.type !== 'tilelayer') return;

    layer.data.forEach((tileGid, index) => {
      if (tileGid === 0) return;

      const mapX = (index % mapWidth) * tileWidth;
      const mapY = Math.floor(index / mapWidth) * tileHeight;

      const tilesetIndex = tileGid - 1;
      const imageNumCols = mapData.tilesets[0].columns; 
      const imageX = (tilesetIndex % imageNumCols) * tileWidth;
      const imageY = Math.floor(tilesetIndex / imageNumCols) * tileHeight;

      ctx.drawImage(
        tilesetImage,
        imageX, imageY, tileWidth, tileHeight, 
        mapX, mapY, tileWidth, tileHeight      
      );
    });
  });
}

loadMap();