import { SlashCommandBuilder } from 'discord.js';
import fetch from 'node-fetch';

export const data = new SlashCommandBuilder()
  .setName('randomvideo')
  .setDescription('指定したYouTube再生リストからランダムな動画を投稿します');

export async function execute(interaction) {
  const playlistId = process.env.YOUTUBE_PLAYLIST_ID;
  const apiKey = process.env.YOUTUBE_API_KEY;

  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.items || data.items.length === 0) {
      await interaction.reply('❌ 再生リストに動画が見つかりませんでした。');
      return;
    }

    const randomItem = data.items[Math.floor(Math.random() * data.items.length)];
    const videoId = randomItem.snippet.resourceId.videoId;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    await interaction.reply(videoUrl);
  } catch (err) {
    console.error('❌ YouTube API エラー:', err);
    await interaction.reply('❌ YouTube API から動画を取得できませんでした。');
  }
}
