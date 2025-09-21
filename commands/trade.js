// trade.js
const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const money = require("../../lib/money");
const db = require("../../lib/db");
const time = require("../../lib/time");
const sign = require("../../lib/sign");

const width = 800;
const height = 400;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

// 株価を10分ごとに自動更新
setInterval(async () => {
    try {
        let data = await db("SELECT * FROM count WHERE id = 1");
        if(!data[0]) return;

        let price = data[0].stock_price || 950; // 初期株価950
        const hour = new Date().getHours();

        // 時間帯によるボラティリティ
        let volatility = 0.002; // ±0.2%
        if(hour >= 0 && hour < 6) volatility = 0.001;
        else if(hour >= 6 && hour < 12) volatility = 0.003;
        else if(hour >= 12 && hour < 18) volatility = 0.005;
        else volatility = 0.002;

        const changePercent = (Math.random() * 2 - 1) * volatility;
        const newPrice = Math.max(1, price * (1 + changePercent));

        await db(`UPDATE count SET stock_price = ${newPrice}, last_update = NOW() WHERE id = 1`);
        // 株価履歴も記録
        await db(`INSERT INTO trade_history (time, price) VALUES (NOW(), ${newPrice})`);
        console.log(`株価更新: ${price.toFixed(2)} → ${newPrice.toFixed(2)}`);
    } catch(e) {
        console.error("株価更新エラー:", e);
    }
}, 600000); // 10分ごと

// グラフ生成関数
async function generateStockGraph() {
    const history = await db("SELECT * FROM trade_history WHERE time >= DATE_SUB(NOW(), INTERVAL 1 DAY) ORDER BY time ASC");
    if(!history.length) return null;

    const labels = history.map(d => d.time.toISOString().slice(11,16)); // HH:MM
    const data = history.map(d => d.price);

    const config = {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: '株価',
                data,
                borderColor: 'rgba(75,192,192,1)',
                backgroundColor: 'rgba(75,192,192,0.2)',
                fill: true,
                tension: 0.2
            }]
        },
        options: {
            scales: {
                x: { title: { display: true, text: '時間' } },
                y: { title: { display: true, text: 'コイン' } }
            },
            plugins: { legend: { display: false } }
        }
    };

    const image = await chartJSNodeCanvas.renderToBuffer(config);
    return new AttachmentBuilder(image, { name: 'stock.png' });
}

// コマンド処理
module.exports = {
    data: [
        new SlashCommandBuilder().setName("graph").setDescription("株価グラフを表示します"),
        new SlashCommandBuilder().setName("trade_buy").setDescription("株を購入します")
            .addIntegerOption(opt => opt.setName("count").setDescription("購入する株数").setRequired(true)),
        new SlashCommandBuilder().setName("trade_sell").setDescription("株を売却します")
            .addIntegerOption(opt => opt.setName("count").setDescription("売却する株数").setRequired(true))
    ],
    async execute(interaction) {
        const command = interaction.commandName;

        // 株価取得
        let priceData = await db("SELECT * FROM count WHERE id = 1");
        if(!priceData[0]) {
            await db("INSERT INTO count (id, stock_price, buy, sell, last_update) VALUES (1, 950, 0, 0, NOW())");
            priceData = await db("SELECT * FROM count WHERE id = 1");
        }
        const price = priceData[0].stock_price;

        // ----------------------
        // 株購入
        // ----------------------
        if(command === "trade_buy") {
            const count = interaction.options.getInteger("count");
            if(count < 1) return interaction.reply({ content: "1株以上指定してください", ephemeral: true });

            const userData = await money.get(interaction.user.id);
            const commission = Math.floor(count * price * 0.03 + count * 0.5);

            if(userData.amount < count * price + commission) {
                return interaction.reply({ content: "所持金が不足しています（手数料込み）", ephemeral: true });
            }

            // 取引制限（5分）
            const history = await db(`SELECT * FROM history WHERE user = ${interaction.user.id} AND (reason='株の購入' OR reason='株の売却') ORDER BY time DESC;`);
            if(history[0] && new Date() - history[0].time <= 300000) {
                return interaction.reply({ content: `次の取引まであと${time(300000 - (new Date() - history[0].time))}です`, ephemeral: true });
            }

            // 株購入処理
            await db(`UPDATE money SET stock = ${userData.stock + count} WHERE id = ${interaction.user.id}`);
            await money.delete(interaction.user.id, count * price, "株の購入");
            await money.delete(interaction.user.id, commission, "株の購入手数料");

            // 株価微調整
            const priceChange = count * 0.0005;
            await db(`UPDATE count SET stock_price = stock_price * (1 + ${priceChange}) WHERE id = 1`);

            return interaction.reply({ content: `株を${count}株購入しました（手数料: ${commission}コイン）` });
        }

        // ----------------------
        // 株売却
        // ----------------------
        else if(command === "trade_sell") {
            const count = interaction.options.getInteger("count");
            const userData = await money.get(interaction.user.id);

            if(count < 1 || userData.stock < count) {
                return interaction.reply({ content: "売却株数が不正です", ephemeral: true });
            }

            // 取引制限（5分）
            const history = await db(`SELECT * FROM history WHERE user = ${interaction.user.id} AND (reason='株の購入' OR reason='株の売却') ORDER BY time DESC;`);
            if(history[0] && new Date() - history[0].time <= 300000) {
                return interaction.reply({ content: `次の取引まであと${time(300000 - (new Date() - history[0].time))}です`, ephemeral: true });
            }

            // 株売却処理
            await db(`UPDATE money SET stock = ${userData.stock - count} WHERE id = ${interaction.user.id}`);
            await money.add(interaction.user.id, count * price, "株の売却");

            // 株価微調整
            const priceChange = count * 0.0005;
            await db(`UPDATE count SET stock_price = stock_price * (1 - ${priceChange}) WHERE id = 1`);

            return interaction.reply({ content: `株を${count}株売却しました` });
        }

        // ----------------------
        // 株価グラフ
        // ----------------------
        else if(command === "graph") {
            await interaction.deferReply();
            const attachment = await generateStockGraph();
            if(!attachment) return interaction.editReply("グラフデータがありません");

            return interaction.editReply({ content: "株価の推移（直近1日）", files: [attachment] });
        }
    }
};
