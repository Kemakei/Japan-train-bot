import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  REST,
  Routes,
  EmbedBuilder,
} from 'discord.js';
import { MongoClient } from "mongodb";
import { scheduleDailyLoanUpdate } from './utils/dailyLoanUpdater.js';
import { getLatestDrawId } from "./utils/draw.js";
// -------------------- Webサーバー設定 --------------------
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is alive!'));
app.all('/', (req, res) => { 
  console.log(`Received a ${req.method} request at '/'`);
  res.sendStatus(200); 
});
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

// ------------------------------------------------------------------------
// 共通関数
function trimQuotes(value) {
  if (!value) return '';
  return value.replace(/^"(.*)"$/, '$1');
}

const playlistId = trimQuotes(process.env.YOUTUBE_PLAYLIST_ID);
const youtubeApiKey = trimQuotes(process.env.YOUTUBE_API_TOKEN);

// ESMで__dirnameを使う
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------- MongoDB 接続 --------------------
const mongoClient = new MongoClient(process.env.MONGO_URI);
await mongoClient.connect();
const db = mongoClient.db("discordBot");
const coinsCol = db.collection("coins"); // coins + stocks + trade_history
const hedgeCol = db.collection("hedges");
const lotteryCol = db.collection("lottery"); // 宝くじ購入履歴

// Discordクライアント初期化
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ★ Discordクライアントにくっつける
client.coinsCol = coinsCol;
client.hedgeCol = hedgeCol;
client.lotteryCol = lotteryCol;
client.db = db;
client.monitoredMessages = new Map();
client.lastSentCopies = new Map();
client.autoRoleMap = new Map();
client.commands = new Collection();

// -------------------- コイン・株管理（MongoDB版） --------------------
client.getUserData = async (userId) => {
  const doc = await coinsCol.findOne({ userId });
  return doc || { userId, coins: 0, stocks: 0 };
};

client.getCoins = async (userId) => {
  const doc = await client.getUserData(userId);
  return doc.coins || 0;
};

client.setCoins = async (userId, amount) => {
  await coinsCol.updateOne(
    { userId },
    { $set: { coins: amount } },
    { upsert: true }
  );
};

client.updateCoins = async (userId, delta) => {
  await coinsCol.updateOne(
    { userId },
    { $inc: { coins: delta } },
    { upsert: true }
  );
};

client.updateStocks = async (userId, delta) => {
  await coinsCol.updateOne(
    { userId },
    { $inc: { stocks: delta } },
    { upsert: true }
  );
};

// -------------------- 株価管理（MongoDB版） --------------------
let forceSign = 0; // -1 = 下げ強制, 1 = 上げ強制, 0 = ランダム

client.getStockPrice = async () => {
  const stock = await coinsCol.findOne({ userId: "stock_price" });
  return typeof stock?.coins === "number" ? stock.coins : 950;
};

client.updateStockPrice = async (delta) => {
  let price = await client.getStockPrice() + delta;

  if (price < 850) {
    price = 850;
    forceSign = 1;
  } else if (price > 1100) {
    price = 1100;
    forceSign = -1;
  }

  await coinsCol.updateOne(
    { userId: "stock_price" },
    { $set: { coins: price } },
    { upsert: true }
  );

  // 履歴管理
  const historyDoc = await coinsCol.findOne({ userId: "trade_history" });
  const history = Array.isArray(historyDoc?.coins) ? historyDoc.coins : [];
  history.push({ time: new Date().toISOString(), price });
  if (history.length > 144) history.shift();

  await coinsCol.updateOne(
    { userId: "trade_history" },
    { $set: { coins: history } },
    { upsert: true }
  );
};

client.modifyStockByTrade = (type, count) => {
  // 株数の平方根をベースにした緩やかな変動
  let delta = Math.max(1, Math.floor(Math.sqrt(count)));

  // 小さなランダム要素（±10%）
  const randomFactor = 1 + (Math.random() * 0.2 - 0.1);
  delta = Math.round(delta * randomFactor);

  // 売買方向を反映
  if (type === "sell") delta = -delta;

  client.updateStockPrice(delta);
};


function randomDelta() {
  const r = Math.random();
  return Math.max(1, Math.floor(r * r * 31));
}

setInterval(() => {
  let sign = forceSign !== 0 ? forceSign : (Math.random() < 0.5 ? -1 : 1);
  forceSign = 0;
  const delta = sign * randomDelta();
  client.updateStockPrice(delta);
  client.getStockPrice().then(price => console.log(`株価自動変動: ${delta}, 現在株価: ${price}`));
}, 10 * 60 * 1000);

// -------------------- ヘッジ契約管理（MongoDB版） --------------------
client.getHedge = async (userId) => {
  return await hedgeCol.findOne({ userId });
};

client.setHedge = async (userId, data) => {
  await hedgeCol.updateOne(
    { userId },
    { $set: data },
    { upsert: true }
  );
};

client.clearHedge = async (userId) => {
  await hedgeCol.deleteOne({ userId });
};

// --- 宝くじ初期化（起動時に DB から復元） ---
async function loadLatestTakarakuji() {
  const drawId = getLatestDrawId(new Date());
  const result = await db.collection("drawResults").findOne({ drawId });

  if (result) {
    client.takarakuji = {
      number: result.number,
      letter: result.letter,
    };
    console.log(`✅ 最新の宝くじ番号を復元: ${result.number}${result.letter} (${drawId})`);
  } else {
    const number = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
    const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));

    client.takarakuji = { number, letter };

    const previousDrawId = getLatestDrawId(new Date());
    await db.collection("drawResults").updateOne(
      { drawId: previousDrawId },
      { $set: { number, letter, drawId: previousDrawId } },
      { upsert: true }
    );

    console.log(`🎰 初回宝くじ番号を生成・保存: ${number}${letter} (${previousDrawId})`);
  }
}

// --- 宝くじ番号更新関数（抽選＋DB保存） ---
async function updateTakarakujiNumber() {
  const now = new Date();
  const minute = now.getMinutes() < 30 ? 0 : 30;
  now.setMinutes(minute, 0, 0);
  const previousDrawId = getLatestDrawId(now);

  try {
    if (client.takarakuji) {
      const { number: oldNumber, letter: oldLetter } = client.takarakuji;

      // 前回分を保存（公開用）
      await db.collection("drawResults").updateOne(
        { drawId: previousDrawId },
        { $set: { number: oldNumber, letter: oldLetter, drawId: previousDrawId } },
        { upsert: true }
      );

      console.log(`💾 保存完了: ${oldNumber}${oldLetter} (${previousDrawId})`);
    }

    // 次回分を生成
    const newNumber = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
    const newLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26));

    // client に保持
    client.takarakuji = { number: newNumber, letter: newLetter };

    // 次回分も DB に保存しておく（drawId は次回のもの）
    const nextDrawId = previousDrawId + 1; // getLatestDrawId のルールに合わせて適宜調整
    await db.collection("drawResults").updateOne(
      { drawId: nextDrawId },
      { $set: { number: newNumber, letter: newLetter, drawId: nextDrawId, published: false } },
      { upsert: true }
    );

    console.log(`🎰 新しい宝くじ番号を生成: ${newNumber}${newLetter} (次回公開用, drawId: ${nextDrawId})`);
  } catch (err) {
    console.error("DB保存失敗:", err);
  }
}

// --- 次回「00」または「30」分に公開するスケジュール ---
function scheduleTakarakujiUpdate() {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const nextHalfHour =
    minutes < 30
      ? (30 - minutes) * 60 * 1000 - seconds * 1000
      : (60 - minutes) * 60 * 1000 - seconds * 1000;

  console.log(`🕒 次の抽選更新は ${Math.ceil(nextHalfHour / 60000)}分後に実行予定`);

  setTimeout(async () => {
    await updateTakarakujiNumber();
    setInterval(updateTakarakujiNumber, 30 * 60 * 1000);
  }, nextHalfHour);
}


// --- データベースサニタイズ ---
async function sanitizeDatabase() {
  console.log("🔹 データベースの初期化チェック中...");
  const coinsDocs = await coinsCol.find({ userId: { $ne: "trade_history" } }).toArray();
  for (const doc of coinsDocs) {
    let needUpdate = false;
    const update = {};

    if (typeof doc.coins !== "number" || isNaN(doc.coins)) {
      update.coins = 0;
      needUpdate = true;
    }
    if (typeof doc.stocks !== "number" || isNaN(doc.stocks)) {
      update.stocks = 0;
      needUpdate = true;
    }

    if (needUpdate) {
      await coinsCol.updateOne({ userId: doc.userId }, { $set: update });
      console.log(`🛠 ${doc.userId} の壊れたコイン/株データを初期化しました`);
    }
  }

  const hedgeDocs = await hedgeCol.find({}).toArray();
  for (const doc of hedgeDocs) {
    if (
      typeof doc.amountPerDay !== "number" || isNaN(doc.amountPerDay) ||
      typeof doc.accumulated !== "number" || isNaN(doc.accumulated) ||
      typeof doc.lastUpdateJST !== "number" || isNaN(doc.lastUpdateJST)
    ) {
      await hedgeCol.deleteOne({ userId: doc.userId });
      console.log(`🛠 ${doc.userId} の壊れた hedge データを削除しました`);
    }
  }

  console.log("✅ データベースの初期化チェック完了");
}

// -------------------- ready イベント統合 --------------------
client.once(Events.ClientReady, async () => {
  console.log(`✅ ログイン完了: ${client.user.tag}`);

  await sanitizeDatabase();
  await loadLatestTakarakuji();
  scheduleTakarakujiUpdate();
  scheduleDailyLoanUpdate(client);

  console.log("🎰 宝くじ自動更新スケジュールが開始されました。");
  console.log("✅ 借金日次更新スケジュールが開始されました。");
});

// ------------------ 🔁 ./commands/*.js を安全に自動読み込み --------------------
import { pathToFileURL } from 'url';
const commandsJSON = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const commandModule = await import(pathToFileURL(filePath).href);

  if ('data' in commandModule && 'execute' in commandModule) {
    const name = commandModule.data.name;

    if (client.commands.has(name)) {
      console.warn(`⚠️ Duplicate command skipped: ${name} (file: ${file})`);
      continue;
    }

    client.commands.set(name, commandModule);
    commandsJSON.push(commandModule.data.toJSON());
    console.log(`✅ Loaded command: ${name} (file: ${file})`);
  } else {
    console.warn(`⚠️ Skipped invalid command file: ${file}`);
  }
}

// ------------------------------------------------------------------------
client.once(Events.ClientReady, async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commandsJSON });
    console.log('✅ スラッシュコマンドを登録しました');
  } catch (err) {
    console.error('❌ コマンド登録失敗:', err);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() && !interaction.isMessageContextMenuCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, { client, playlistId, youtubeApiKey });
  } catch (error) {
    console.error(`❌ コマンド実行中にエラーが発生しました:`, error);
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: "❌ コマンド実行中にエラーが発生しました", flags: 64 });
    } else {
      await interaction.editReply({ content: "❌ コマンド実行中にエラーが発生しました", flags: 64 });
    }
  }
});

// -------------------- 自動ロール付与 --------------------
client.on(Events.GuildMemberAdd, async member => {
  const roleId = client.autoRoleMap.get(member.guild.id);
  if (!roleId) return;
  const role = member.guild.roles.cache.get(roleId);
  if (!role) {
    console.log(`❌ ロールID「${roleId}」が見つかりません`);
    return;
  }
  try {
    await member.roles.add(role);
    console.log(`✅ ${member.user.tag} にロール「${role.name}」を付与しました`);
  } catch (err) {
    console.error(`❌ ロール付与エラー:`, err);
  }
});

// -------------------- メッセージ監視 --------------------
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  const channelId = message.channel.id;
  const monitoredMessageId = client.monitoredMessages.get(channelId);
  if (!monitoredMessageId) return;

  try {
    const monitoredMessage = await message.channel.messages.fetch(monitoredMessageId);
    if (!monitoredMessage) return;

    const lastCopyId = client.lastSentCopies.get(channelId);
    if (lastCopyId) {
      try {
        const lastCopyMsg = await message.channel.messages.fetch(lastCopyId);
        if (lastCopyMsg) await lastCopyMsg.delete();
      } catch {}
      client.lastSentCopies.delete(channelId);
    }

    let description = monitoredMessage.content || '';
    const files = [];
    if (monitoredMessage.attachments.size > 0) {
      for (const attachment of monitoredMessage.attachments.values()) {
        files.push({ attachment: attachment.url, name: attachment.name });
      }
    }
    if (description) description += '\n';

    const embed = new EmbedBuilder()
      .setAuthor({ name: monitoredMessage.author.tag, iconURL: monitoredMessage.author.displayAvatarURL() })
      .setDescription(description.trim() || '📌 このメッセージに内容がありません。')
      .setColor('#00AAFF');

    if (files.length > 0) embed.setImage(files[0].attachment);

    const sentMessage = await message.channel.send({ embeds: [embed], files });
    client.lastSentCopies.set(channelId, sentMessage.id);
  } catch (err) {
    console.error('監視中メッセージ再送信エラー:', err);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
