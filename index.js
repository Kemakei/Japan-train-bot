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
let db;
try {
  await mongoClient.connect();
  db = mongoClient.db("discordBot");
  console.log("✅ MongoDB 接続成功");
} catch (err) {
  console.error("❌ MongoDB 接続失敗:", err);
}
const coinsCol = db.collection("coins"); // coins + stocks + trade_history
const hedgeCol = db.collection("hedges");

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
client.db = db;
client.monitoredMessages = new Map();
client.lastSentCopies = new Map();
client.autoRoleMap = new Map();
client.reminders = new Map();
client.commands = new Collection();
client.lotteryTickets = client.db.collection("lotteryTickets");
client.stockHistoryCol = client.db.collection("stock_history");

// -------------------- コイン・株管理（MongoDB版 + VIPCoins追加） --------------------

// 既存: ユーザーデータ取得
client.getUserData = async (userId) => {
  const doc = await coinsCol.findOne({ userId });
  // VIPCoinsを未設定なら0で初期化
  return doc || { userId, coins: 0, stocks: 0, VIPCoins: 0 };
};

// 既存: Coins
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

client.updateStocks = async (userId, stockId, delta) => {
  await client.stockHistoryCol.updateOne(
    { userId },
    { $inc: { [`stocks.${stockId}`]: delta } }, 
    { upsert: true } 
  );
};

// -------------------- 金コイン --------------------
client.getVIPCoins = async (userId) => {
  const doc = await client.getUserData(userId);
  return doc.VIPCoins || 0;
};

client.setVIPCoins = async (userId, amount) => {
  await coinsCol.updateOne(
    { userId },
    { $set: { VIPCoins: amount } },
    { upsert: true }
  );
};

client.updateVIPCoins = async (userId, delta) => {
  await coinsCol.updateOne(
    { userId },
    { $inc: { VIPCoins: delta } },
    { upsert: true }
  );
};


// -------------------- 株価管理（MongoDB版） --------------------
// ===== 株マスタ（固定8社 + 上限/下限設定）=====
const STOCKS = [
  { id: "A", name: "tootle株式会社",        base: 1000, min: 700,  max: 1300 },
  { id: "B", name: "ハイシロソフト株式会社", base: 1500, min: 1000,  max: 2000 },
  { id: "C", name: "バナナ株式会社",        base: 600,  min: 300,  max: 1000 },
  { id: "D", name: "ネムーイ株式会社",      base: 200,  min: 50,  max: 500 },
  { id: "E", name: "ナニイッテンノー株式会社", base: 3000, min: 1000, max: 5000 },
  { id: "F", name: "ダカラナニー株式会社",  base: 1750,  min: 900,  max: 3000 },
  { id: "G", name: "ホシーブックス株式会社", base: 9000, min: 2500,  max: 15000 },
  { id: "H", name: "ランランルー株式会社",  base: 5000, min: 1500, max: 7000 },
];

// MongoDBコレクション
client.stockHistoryCol = client.db.collection("stock_history");

// ===== 株価取得 =====
client.getStockPrice = async (stockId) => {
  const stockDoc = await client.stockHistoryCol.findOne({ userId: `stock_price_${stockId}` });
  return typeof stockDoc?.currentPrice === "number" ? stockDoc.currentPrice : STOCKS.find(s => s.id === stockId).base;
};

// ===== 株価更新（delta反映 + 上下限 + 履歴保存） =====
client.updateStockPrice = async (stockId, delta) => {
  const stock = STOCKS.find(s => s.id === stockId);
  if (!stock) return;

  // 現在株価取得
  const stockDoc = await client.stockHistoryCol.findOne({ userId: `stock_price_${stockId}` });
  let price = (stockDoc?.currentPrice ?? stock.base) + delta;

  // 上下限チェック
  if (price < stock.min) price = stock.min;
  if (price > stock.max) price = stock.max;

  // 株価保存
  await client.stockHistoryCol.updateOne(
    { userId: `stock_price_${stockId}` },
    { $set: { currentPrice: price } },
    { upsert: true }
  );

  // 履歴追加
  const historyDoc = await client.stockHistoryCol.findOne({ userId: `trade_history_${stockId}` });
  const history = Array.isArray(historyDoc?.history) ? historyDoc.history : [];
  history.push({ time: new Date().toISOString(), price });
  if (history.length > 144) history.shift(); // 過去24時間分（10分ごと → 144個）

  await client.stockHistoryCol.updateOne(
    { userId: `trade_history_${stockId}` },
    { $set: { history } },
    { upsert: true }
  );
};

// ===== 自動株価変動（10分ごと） =====
setInterval(async () => {
  for (const stock of STOCKS) {
    const currentPrice = await client.getStockPrice(stock.id);

    // ±10%以内の変動幅を決定
    let delta = Math.round((Math.random() - 0.5) * 0.2 * stock.base);

    // 最低値に達していたら必ず上がる
    if (currentPrice <= stock.min) {
      delta = Math.max(1, Math.abs(delta)); // +1以上
    }

    // 最高値に達していたら必ず下がる
    if (currentPrice >= stock.max) {
      delta = -Math.max(1, Math.abs(delta)); // -1以下
    }

    // 0もあり得る
    if (Math.random() < 0.1) delta = 0;

    // 株価更新
    await client.updateStockPrice(stock.id, delta);

    const price = await client.getStockPrice(stock.id);
    const sign = delta > 0 ? "+" : delta < 0 ? "-" : "0";
    console.log(`株価自動変動: ${stock.name} ${sign}${Math.abs(delta)}, 現在株価: ${price}`);
  }
}, 10 * 60 * 1000); // 10分ごと


// -------------------- 職業・才能スコア保存 --------------------
client.getJobData = async (userId) => {
  const doc = await client.db.collection("jobs").findOne({ userId });
  return doc || { userId, job: "無職", talent: 0, lastJobChange: 0 };
};

client.setJobData = async (userId, data) => {
  await client.db.collection("jobs").updateOne(
    { userId },
    { $set: data },
    { upsert: true }
  );
};

client.updateJobData = async (userId, delta) => {
  // delta: { job, talent, lastJobChange }
  await client.db.collection("jobs").updateOne(
    { userId },
    { $set: delta },
    { upsert: true }
  );
};

// -------------------- ライセンス保存 --------------------
client.hasLicense = async (userId, licenseName) => {
  const doc = await client.db
    .collection('licenses')
    .findOne({ userId: String(userId) });

  if (!doc) return false;
  if (!Array.isArray(doc.obtained)) return false;

  return doc.obtained.includes(licenseName);
};

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

    // --- 7日以上経過したチケットを自動削除 ---
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    await db.collection("lotteryTickets").deleteMany({
      drawId: { $exists: true },
      $expr: {
        $lte: [
          {
            $dateFromString: {
              dateString: {
                $concat: [
                  { $substr: ["$drawId", 0, 4] }, "-", 
                  { $substr: ["$drawId", 4, 2] }, "-", 
                  { $substr: ["$drawId", 6, 2] } 
                ]
              }
            }
          },
          sevenDaysAgo
        ]
      }
    });

    console.log("🗑 7日以上経過した宝くじチケットを自動削除しました");

  } catch (err) {
    console.error("DB保存または削除失敗:", err);
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

// --- 失業保険 ---
async function checkUnemployTimers(client) {
  const col = client.db.collection("unemploy_timers");
  const now = Date.now();

  const expired = await col.find({
    expireAt: { $lte: now },
    notified: false
  }).toArray();

  for (const doc of expired) {
    try {
      const guild = await client.guilds.fetch(doc.guildId);
      const channel = await guild.channels.fetch(doc.channelId);

      if (channel) {
        await channel.send(
          `<@${doc.userId}> takasumi botでの失業保険が切れました`
        );
      }
    } finally {
      await col.updateOne(
        { _id: doc._id },
        { $set: { notified: true } }
      );
    }
  }
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
  console.log(`🤖 Logged in as ${client.user.tag}`);
  console.log(`✅ ログイン完了: ${client.user.tag}`);

  await sanitizeDatabase();
  await loadLatestTakarakuji();
  scheduleTakarakujiUpdate();
  scheduleDailyLoanUpdate(client);

// ---- 失業保険期限チェック（1分ごと） ----
  setInterval(() => {
  checkUnemployTimers(client)
    .catch(err => console.error("失業保険チェック失敗:", err));
  }, 60 * 1000);
  
  console.log("🎰 宝くじ自動更新スケジュールが開始されました。");
  console.log("✅ 借金日次更新スケジュールが開始されました。");

  // スラッシュコマンド登録
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commandsJSON });
    console.log('✅ スラッシュコマンドを登録しました');
  } catch (err) {
    console.error('❌ コマンド登録失敗:', err);
  }
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

// ----------------------------------------------------------------------
client.on(Events.InteractionCreate, async interaction => {
  try {
    // ===== ボタンインタラクション対応（trade_graph）=====
   if (interaction.isButton()) {
     const command = client.commands.get("trade_graph");

     if (command && typeof command.handleButton === "function") {
       try {
         await command.handleButton(interaction);
       } catch (err) {
         console.error("Button handling error:", err);
         if (!interaction.replied && !interaction.deferred) {
           await interaction.reply({
             content: "❌ ボタン処理中にエラーが発生しました",
             ephemeral: true,
           });
          }
         }
        }
       return;
      }
    // オートコンプリート処理
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command || !command.handleAutocomplete) return;
      await command.handleAutocomplete(interaction);
      return;
    }

    // チャット入力コマンド
    if (!interaction.isChatInputCommand() && !interaction.isMessageContextMenuCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    await command.execute(interaction, { client, playlistId, youtubeApiKey });
  } catch (error) {
    console.error(error);
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

client.login(process.env.DISCORD_BOT_TOKEN)
  .then(() => {
    console.log("🟢 Discord login called");
    console.log('Gateway status:', client.ws.status);
  })
  .catch(err => console.error("❌ Discord login failed:", err));