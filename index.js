import dotenv from 'dotenv';
dotenv.config();

import fetch from 'node-fetch';
import {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  REST,
  Routes,
  EmbedBuilder,
} from 'discord.js';

import * as addRoleCommand from './commands/addrole.js';
import * as pinMessageCommand from './commands/pinmessage.js';
import * as deleteMessageCommand from './commands/deletewords.js';
import * as playlistsCommand from './commands/playlists.js';

// YouTubeプレイリストIDなどを.envから読み込み＆ダブルクォーテーション除去関数
function trimQuotes(value) {
  if (!value) return '';
  return value.replace(/^"(.*)"$/, '$1');
}

const playlistId = trimQuotes(process.env.YOUTUBE_PLAYLIST_ID);
const youtubeApiKey = trimQuotes(process.env.YOUTUBE_API_TOKEN);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// 監視メッセージ管理用Maps
client.monitoredMessages = new Map();  // channelId -> messageId（監視対象メッセージ）
client.lastSentCopies = new Map();     // channelId -> messageId（最後に再送信したEmbedメッセージ）

client.autoRoleMap = new Map();

client.commands = new Collection();
client.commands.set(addRoleCommand.data.name, addRoleCommand);
client.commands.set(pinMessageCommand.data.name, pinMessageCommand);
client.commands.set(deleteMessageCommand.data.name, deleteMessageCommand);
client.commands.set(playlistsCommand.data.name, playlistsCommand);

client.once(Events.ClientReady, async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: [
          addRoleCommand.data.toJSON(),
          pinMessageCommand.data.toJSON(),
          deleteMessageCommand.data.toJSON(),
          playlistsCommand.data.toJSON(),
        ],
      }
    );
    console.log('✅ スラッシュコマンドとコンテキストメニューを登録しました');
  } catch (err) {
    console.error('❌ コマンド登録失敗:', err);
  }
});

// コマンド実行処理
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand() || interaction.isMessageContextMenuCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, { playlistId, youtubeApiKey });
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: '❌ コマンド実行中にエラーが発生しました。', ephemeral: true });
    }
  }
});

// 新規参加者に自動でロール付与
client.on(Events.GuildMemberAdd, async member => {
  const roleName = client.autoRoleMap.get(member.guild.id);
  if (!roleName) return;

  const role = member.guild.roles.cache.find(r => r.name === roleName);
  if (!role) {
    console.log(`❌ ロール「${roleName}」が見つかりません`);
    return;
  }

  try {
    await member.roles.add(role);
    console.log(`✅ ${member.user.tag} にロール「${role.name}」を付与しました`);
  } catch (err) {
    console.error(`❌ ロール付与エラー:`, err);
  }
});

// メッセージが投稿されたら監視対象メッセージをEmbedで再表示
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  const channelId = message.channel.id;
  const monitoredMessageId = client.monitoredMessages.get(channelId);
  if (!monitoredMessageId) return;

  try {
    const monitoredMessage = await message.channel.messages.fetch(monitoredMessageId);
    if (!monitoredMessage) return;

    // 古い再表示メッセージを削除
    const lastCopyId = client.lastSentCopies.get(channelId);
    if (lastCopyId) {
      try {
        const lastCopyMsg = await message.channel.messages.fetch(lastCopyId);
        if (lastCopyMsg) await lastCopyMsg.delete();
      } catch {}

      client.lastSentCopies.delete(channelId);
    }

    // メッセージ内容と添付ファイルをEmbedにまとめる
    let description = monitoredMessage.content || '';

    const files = [];
    if (monitoredMessage.attachments.size > 0) {
      for (const attachment of monitoredMessage.attachments.values()) {
        files.push({
          attachment: attachment.url,
          name: attachment.name,
        });
      }
    }

    if (description) description += '\n';

    const embed = new EmbedBuilder()
      .setAuthor({
        name: monitoredMessage.author.tag,
        iconURL: monitoredMessage.author.displayAvatarURL(),
      })
      .setDescription(description.trim() || '📌 このメッセージに内容がありません。')
      .setColor('#00AAFF');

    if (files.length > 0) {
      embed.setImage(files[0].attachment);
    }

    const sentMessage = await message.channel.send({ embeds: [embed], files });
    client.lastSentCopies.set(channelId, sentMessage.id);
  } catch (err) {
    console.error('監視中メッセージ再送信エラー:', err);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);