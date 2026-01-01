// commands/treasure.js
import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("treasure")
  .setDescription("4x4宝探しゲームを開始します")
  .addIntegerOption(option =>
    option.setName("bet")
      .setDescription("掛け金を入力")
      .setRequired(true)
      .setMinValue(100)
  );

// 当たりマスを決める関数（職業で変化）
function pickResult(jobName = '無職') {
  const board = Array.from({ length: 4 }, () => Array(4).fill(0));
  const hitCount = jobName === 'ギャンブラー' ? 2 : 1;

  const positions = new Set();
  while (positions.size < hitCount) {
    const pos = Math.floor(Math.random() * 16);
    positions.add(pos);
  }

  for (const pos of positions) {
    const x = pos % 4;
    const y = Math.floor(pos / 4);
    board[y][x] = 1; // 当たり
  }

  return board;
}

export async function execute(interaction, { client }) {
  const bet = interaction.options.getInteger("bet");
  const userId = interaction.user.id;

  // 所持コイン確認
  const coins = await client.getCoins(userId);
  if (coins < bet) {
    return interaction.reply({ content: `❌ 所持コインが足りません。現在のコイン: ${coins}`, ephemeral: true });
  }

  // ユーザー職業取得
  const jobDoc = await client.db.collection("jobs").findOne({ userId });
  const jobName = jobDoc?.job || '無職';

  // ボード作成
  const board = pickResult(jobName);

  // 初期状態
  const game = {
    userId,
    board,
    position: { x: 3, y: 0 }, // 右上スタート
    chances: 5,
    bet,
    status: "playing"
  };

  await client.db.collection("treasureGames").updateOne(
    { userId, status: "playing" },
    { $set: game },
    { upsert: true }
  );

  // Embedとボタン
  const embed = new EmbedBuilder()
    .setTitle("🎯 宝探しゲーム")
    .setDescription(renderBoard(game))
    .setFooter({ text: `残りチェック回数: ${game.chances}` })
    .setColor("#FFD700");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("up").setLabel("⬆️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("down").setLabel("⬇️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("left").setLabel("⬅️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("right").setLabel("➡️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("check").setLabel("✅").setStyle(ButtonStyle.Success)
  );

  const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

  // ボタン処理
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 5 * 60 * 1000 });

  collector.on("collect", async i => {
    if (i.user.id !== userId) return i.reply({ content: "❌ あなたのゲームではありません", ephemeral: true });

    let game = await client.db.collection("treasureGames").findOne({ userId, status: "playing" });
    if (!game) return i.update({ content: "❌ ゲームが見つかりません", components: [], embeds: [] });

    if (["up","down","left","right"].includes(i.customId)) {
      const { x, y } = game.position;
      let nx = x, ny = y;
      if (i.customId === "up" && y > 0) ny--;
      if (i.customId === "down" && y < 3) ny++;
      if (i.customId === "left" && x > 0) nx--;
      if (i.customId === "right" && x < 3) nx++;

      await client.db.collection("treasureGames").updateOne({ userId }, { $set: { "position.x": nx, "position.y": ny } });
      game.position = { x: nx, y: ny };

      await i.update({ embeds: [updateEmbed(game)], components: [row] });
      return;
    }

    if (i.customId === "check") {
      const { x, y } = game.position;
      const hit = game.board[y][x] === 1;
      let replyText = "";

      if (hit) {
        const reward = game.bet * 5;
        await client.updateCoins(userId, reward);
        const coinsAfter = await client.getCoins(userId);
        if (coinsAfter < 0) await client.setCoins(userId, 0);

        replyText = `成功\nコイン +${reward} 獲得！`;
        await client.db.collection("treasureGames").updateOne({ userId }, { $set: { status: "finished" } });
        collector.stop();
      } else {
        game.chances--;
        if (game.chances <= 0) {
          const loss = game.bet * 3;
          await client.updateCoins(userId, -loss);
          const coinsAfter = await client.getCoins(userId);
          if (coinsAfter < 0) await client.setCoins(userId, 0);

          replyText = `失敗\n-${loss}コイン`;
          await client.db.collection("treasureGames").updateOne({ userId }, { $set: { status: "finished" } });
          collector.stop();
        } else {
          await client.db.collection("treasureGames").updateOne({ userId }, { $set: { chances: game.chances } });
        }
      }

      await i.update({ embeds: [updateEmbed(game)], content: replyText, components: [row] });
    }
  });

  collector.on("end", async () => {
    const game = await client.db.collection("treasureGames").findOne({ userId });
    if (game?.status === "playing") {
      await client.db.collection("treasureGames").updateOne({ userId }, { $set: { status: "finished" } });
      const endEmbed = updateEmbed(game);
      await message.edit({ embeds: [endEmbed], content: "⌛ ゲーム時間切れです", components: [] });
    } else {
      await message.edit({ components: [] });
    }
  });
}

// ボード表示
function renderBoard(game) {
  let text = "";
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      if (game.position.x === x && game.position.y === y) {
        text += "🟩 "; // カーソル
      } else {
        text += "⬜ "; // 未チェック
      }
    }
    text += "\n";
  }
  return text;
}

// Embed更新
function updateEmbed(game) {
  return new EmbedBuilder()
    .setTitle("🎯 宝探しゲーム")
    .setDescription(renderBoard(game))
    .setFooter({ text: `残りチェック回数: ${game.chances}` })
    .setColor("#FFD700");
}
