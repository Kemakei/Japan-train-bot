import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import { spawn } from "child_process";
import money from "../../lib/money.js";
import db from "../../lib/db.js";
import time from "../../lib/time.js";

export const data = [
    new SlashCommandBuilder().setName("graph").setDescription("株価グラフを表示します"),
    new SlashCommandBuilder().setName("trade_buy").setDescription("株を購入します")
        .addIntegerOption(opt => opt.setName("count").setDescription("購入する株数").setRequired(true)),
    new SlashCommandBuilder().setName("trade_sell").setDescription("株を売却します")
        .addIntegerOption(opt => opt.setName("count").setDescription("売却する株数").setRequired(true))
];

async function generateGraph(history) {
    return new Promise((resolve, reject) => {
        const py = spawn("python3", ["./python/graph.py", JSON.stringify(history)]);

        let chunks = [];
        py.stdout.on("data", chunk => chunks.push(chunk));
        py.stderr.on("data", err => console.error(err.toString()));

        py.on("close", code => {
            if(code !== 0) return reject(new Error(`Python exited with code ${code}`));
            const buffer = Buffer.concat(chunks);
            resolve(new AttachmentBuilder(buffer, { name: "stock.png" }));
        });
    });
}

export async function execute(interaction) {
    const command = interaction.commandName;

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

        const historyCheck = await db(`SELECT * FROM history WHERE user=${interaction.user.id} AND (reason='株の購入' OR reason='株の売却') ORDER BY time DESC`);
        if(historyCheck[0] && new Date() - historyCheck[0].time <= 300000) {
            return interaction.reply({ content: `次の取引まであと${time(300000 - (new Date() - historyCheck[0].time))}です`, ephemeral: true });
        }

        await db(`UPDATE money SET stock=${userData.stock + count} WHERE id=${interaction.user.id}`);
        await money.delete(interaction.user.id, count * price, "株の購入");
        await money.delete(interaction.user.id, commission, "株の購入手数料");

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

        const historyCheck = await db(`SELECT * FROM history WHERE user=${interaction.user.id} AND (reason='株の購入' OR reason='株の売却') ORDER BY time DESC`);
        if(historyCheck[0] && new Date() - historyCheck[0].time <= 300000) {
            return interaction.reply({ content: `次の取引まであと${time(300000 - (new Date() - historyCheck[0].time))}です`, ephemeral: true });
        }

        await db(`UPDATE money SET stock=${userData.stock - count} WHERE id=${interaction.user.id}`);
        await money.add(interaction.user.id, count * price, "株の売却");

        const priceChange = count * 0.0005;
        await db(`UPDATE count SET stock_price = stock_price * (1 - ${priceChange}) WHERE id = 1`);

        return interaction.reply({ content: `株を${count}株売却しました` });
    }

    // ----------------------
    // 株価グラフ
    // ----------------------
    else if(command === "graph") {
        await interaction.deferReply();

        const historyData = await db("SELECT * FROM trade_history WHERE time >= DATE_SUB(NOW(), INTERVAL 1 DAY) ORDER BY time ASC");
        if(!historyData.length) return interaction.editReply("グラフデータがありません");

        const attachment = await generateGraph(historyData);
        return interaction.editReply({ content: "株価の推移（直近1日）", files: [attachment] });
    }
}
