const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    drawMap();
});
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

let mapData;

const tilesets = [];

async function loadMap() {
    const response = await fetch("assets/map.json");
    mapData = await response.json();

    // imageを持つタイルセットだけ読み込む
    const promises = mapData.tilesets
        .filter(ts => ts.image)
        .map(ts => {
            return new Promise(resolve => {
                const img = new Image();
                img.src = "assets/" + ts.image;

                img.onload = () => {
                    tilesets.push({
                        firstgid: ts.firstgid,
                        columns: ts.columns,
                        tilewidth: ts.tilewidth,
                        tileheight: ts.tileheight,
                        image: img
                    });
                    resolve();
                };
            });
        });

    await Promise.all(promises);

    // firstgid順に並べる
    tilesets.sort((a, b) => a.firstgid - b.firstgid);

    drawMap();
}

function drawMap() {

    const tileWidth = mapData.tilewidth;
    const tileHeight = mapData.tileheight;
    const mapWidth = mapData.width;

    mapData.layers.forEach(layer => {

        if (layer.type !== "tilelayer") return;

        layer.data.forEach((gid, index) => {

            if (gid === 0) return;

            // 使用するタイルセットを探す
            let ts = tilesets[0];

            for (let i = 0; i < tilesets.length; i++) {
                if (gid >= tilesets[i].firstgid) {
                    ts = tilesets[i];
                }
            }

            const localId = gid - ts.firstgid;

            const sx = (localId % ts.columns) * tileWidth;
            const sy = Math.floor(localId / ts.columns) * tileHeight;

            const dx = (index % mapWidth) * tileWidth;
            const dy = Math.floor(index / mapWidth) * tileHeight;

            const scaleX = canvas.width / (mapData.width * tileWidth);
const scaleY = canvas.height / (mapData.height * tileHeight);

ctx.drawImage(
    ts.image,
    sx,
    sy,
    tileWidth,
    tileHeight,
    dx * scaleX,
    dy * scaleY,
    tileWidth * scaleX,
    tileHeight * scaleY
);
            );

        });

    });

}

loadMap();