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

// Discordクライアント初期化
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.monitoredMessages = new Map();
client.lastSentCopies = new Map();
client.autoRoleMap = new Map();
client.commands = new Collection();

// -------------------- コイン管理（永続化込み） --------------------
const coinsFile = path.join(__dirname, 'coins.json');

function loadCoins() {
  if (!fs.existsSync(coinsFile)) fs.writeFileSync(coinsFile, JSON.stringify({}));
  const raw = JSON.parse(fs.readFileSync(coinsFile, 'utf-8'));
  const map = new Map();
  for (const [userId, data] of Object.entries(raw)) {
    map.set(userId, { coins: data.coins ?? 0 });
  }

  // 株価関連初期化
  if (!map.has("stock_price")) map.set("stock_price", 950);
  if (!map.has("trade_history")) map.set("trade_history", []);

  return map;
}

function saveCoins(map) {
  const obj = {};
  for (const [userId, data] of map) obj[userId] = data;
  fs.writeFileSync(coinsFile, JSON.stringify(obj, null, 2));
}

client.coins = loadCoins();

client.getCoins = (userId) => client.coins.get(userId)?.coins || 0;
client.setCoins = (userId, amount) => {
  const data = client.coins.get(userId) || { coins: 0 };
  data.coins = Number(amount);
  client.coins.set(userId, data);
  saveCoins(client.coins);
};
client.updateCoins = (userId, delta) => {
  const data = client.coins.get(userId) || { coins: 0 };
  data.coins = (data.coins || 0) + Number(delta);
  client.coins.set(userId, data);
  saveCoins(client.coins);
};

client.on(Events.GuildMemberAdd, member => {
  if (!client.coins.has(member.id)) client.setCoins(member.id, 0);
});

// -------------------- 株価管理 --------------------

// 株価と履歴の初期化
client.getStockPrice = () => {
  const obj = client.coins.get("stock_price");
  return typeof obj?.coins === "number" ? obj.coins : 950;
};

client.coins.set("stock_price", { coins: client.getStockPrice() });

let forceSign = 0; // -1 = 下げ強制, 1 = 上げ強制, 0 = ランダム

// 株価変動処理
client.updateStockPrice = (delta) => {
  let price = client.getStockPrice() + delta;

  if (price < 850) {
    price = 850;
    forceSign = 1; // 次回上昇
  } else if (price > 1100) {
    price = 1100;
    forceSign = -1; // 次回下降
  }

  // 保存
  client.coins.set("stock_price", { coins: price });

  // 履歴管理
  const historyObj = client.coins.get("trade_history");
  const history = Array.isArray(historyObj?.coins) ? historyObj.coins : [];
  history.push({ time: new Date().toISOString(), price });
  if (history.length > 144) history.shift(); // 直近1日分
  client.coins.set("trade_history", { coins: history });

  saveCoins(client.coins);
};

// 売買による株価変動
client.modifyStockByTrade = (type, count) => {
  let delta = Math.max(1, Math.floor(count * 0.5));
  if (type === "sell") delta = -delta;
  client.updateStockPrice(delta);
};

// 自動株価変動（10分ごと）
function randomDelta() {
  const r = Math.random();
  return Math.max(1, Math.floor(r * r * 31));
}

setInterval(() => {
  let sign = forceSign !== 0 ? forceSign : (Math.random() < 0.5 ? -1 : 1);
  forceSign = 0;

  const delta = sign * randomDelta();
  client.updateStockPrice(delta);
  console.log(`株価自動変動: ${delta}, 現在株価: ${client.getStockPrice()}`);
}, 10 * 60 * 1000);

// -------------------- ヘッジ契約管理 --------------------
const hedgeFile = path.join(__dirname, 'hedgeContracts.json');

function loadHedges() {
  if (!fs.existsSync(hedgeFile)) fs.writeFileSync(hedgeFile, JSON.stringify({}));
  const raw = JSON.parse(fs.readFileSync(hedgeFile, 'utf-8'));
  return new Map(Object.entries(raw));
}

function saveHedges() {
  const obj = Object.fromEntries(client.hedgeContracts);
  fs.writeFileSync(hedgeFile, JSON.stringify(obj, null, 2));
}

client.hedgeContracts = loadHedges();

client.getHedge = (userId) => client.hedgeContracts.get(userId) || null;
client.setHedge = (userId, data) => {
  client.hedgeContracts.set(userId, data);
  saveHedges();
};
client.clearHedge = (userId) => {
  client.hedgeContracts.delete(userId);
  saveHedges();
};

// --------------------- 宝くじ番号管理 ---------------------
client.takarakuji = {
  number: String(Math.floor(Math.random() * 90000) + 10000),
  letter: String.fromCharCode(65 + Math.floor(Math.random() * 26))
};

// ユーザー購入履歴（複数購入対応）
// userId => [ { number, letter, drawNumber, drawLetter, claimed } ]
client.takarakujiPurchases = new Map();

// 固定30分ごとに当選番号更新
function scheduleTakarakujiUpdate() {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  
  let delay;
  if (minutes < 30) {
    delay = (30 - minutes) * 60 * 1000 - seconds * 1000;
  } else {
    delay = (60 - minutes) * 60 * 1000 - seconds * 1000;
  }

  setTimeout(() => {
    updateTakarakujiNumber();
    setInterval(updateTakarakujiNumber, 30 * 60 * 1000);
  }, delay);
}

function updateTakarakujiNumber() {
  const oldNumber = client.takarakuji.number;
  const oldLetter = client.takarakuji.letter;

  // 新しい番号生成
  client.takarakuji.number = String(Math.floor(Math.random() * 90000) + 10000);
  client.takarakuji.letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));

  // 未割当購入に当選番号を割り当てる
  client.takarakujiPurchases.forEach((purchases) => {
    purchases.forEach(purchase => {
      if (!purchase.drawNumber) {
        purchase.drawNumber = oldNumber;
        purchase.drawLetter = oldLetter;
        purchase.claimed = false;
      }
    });
  });

  console.log(`🎟 宝くじ番号更新: ${client.takarakuji.number}${client.takarakuji.letter}`);
}

// デプロイ時にスケジュール開始
scheduleTakarakujiUpdate();

// ------------------ 🔁 ./commands/*.js を自動読み込み --------------------
const commandsJSON = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = await import(`file://${filePath}`);
  if ('data' in command && 'execute' in command) {
    const name = command.data.name;
    if (client.commands.has(name)) {
      console.warn(`⚠️ Duplicate command skipped: ${name}`);
      continue;
    }
    client.commands.set(name, command);
    commandsJSON.push(command.data.toJSON());
    console.log(`✅ Loaded command: ${name}`);
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
