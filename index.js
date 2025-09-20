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
app.all('/', (req, res) => { console.log(`Received a ${req.method} request at '/'`); res.sendStatus(200); });
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
    map.set(userId, {
      coins: data.coins ?? 0,
    });
  }
  return map;
}

function saveCoins(map) {
  const obj = {};
  for (const [userId, data] of map) {
    obj[userId] = {
      coins: data.coins ?? 0,
    };
  }
  fs.writeFileSync(coinsFile, JSON.stringify(obj, null, 2));
}

// 起動時ロード
client.coins = loadCoins();

// ユーティリティ関数
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

// 新規ユーザーは0スタート
client.on(Events.GuildMemberAdd, member => {
  if (!client.coins.has(member.id)) {
    client.setCoins(member.id, 0);
  }
});

// ------------------ 🔁 ./commands/*.js を自動読み込み（重複防止付き） --------------------
const commandsJSON = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = await import(`file://${filePath}`);

  if ('data' in command && 'execute' in command) {
    const name = command.data.name;

    // 重複チェック
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
    // 必要であれば一度全削除してから登録
    // await rest.put(Routes.applicationCommands(client.user.id), { body: [] });

    await rest.put(Routes.applicationCommands(client.user.id), { body: commandsJSON });
    console.log('✅ スラッシュコマンドを登録しました');
  } catch (err) {
    console.error('❌ コマンド登録失敗:', err);
  }
});

// -------------------- InteractionCreate --------------------
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() && !interaction.isMessageContextMenuCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, { playlistId, youtubeApiKey });
  } catch (error) {
    console.error(error);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ コマンド実行中にエラーが発生しました。', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ コマンド実行中にエラーが発生しました。', ephemeral: true });
      }
    } catch (err) {
      console.error('❌ 返信失敗:', err);
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
