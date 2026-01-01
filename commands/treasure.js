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

// ボード描画（チェック状況を反映）
function renderBoard(game) {
  let text = "";
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const pos = game.position;
      const checked = game.checked?.[y]?.[x] || 0; 

      if (pos.x === x && pos.y === y) {
        text += "🟨"; 
      } else if (checked === 1) {
        text += "⬜"; 
      } else if (checked === 2) {
        text += "🟩"; 
      } else {
        text += "⬛"; 
      }
    }
    text += "\n";
  }

  if (game.resultText) {
    text += `\n${game.resultText}`; 
  }

  return text;
}

function updateEmbed(game) {
  return new EmbedBuilder()
    .setTitle("🎯 宝探しゲーム")
    .setDescription(renderBoard(game))
    .setFooter({ text: `残りチェック回数: ${game.chances}` })
    .setColor("#FFD700");
}

export async function execute(interaction, { client }) {
  const bet = interaction.options.getInteger("bet");
  const userId = interaction.user.id;

  // 所持コイン確認
  const coins = await client.getCoins(userId);
  if (coins < bet) {
    return interaction.reply({ content: `❌ 所持コインが足りません。現在のコイン: ${coins}`, ephemeral: true });
  }

  // 職業取得
  const jobDoc = await client.db.collection("jobs").findOne({ userId });
  const jobName = jobDoc?.job || '無職';

  // ボード作成
  const board = pickResult(jobName);

  // 初期状態
  const game = {
    userId,
    board,
    checked: Array.from({ length: 4 }, () => Array(4).fill(0)), 
    position: { x: 3, y: 0 },
    chances: 5,
    bet,
    status: "playing",
    resultText: ""
  };

  await client.db.collection("treasureGames").updateOne(
    { userId, status: "playing" },
    { $set: game },
    { upsert: true }
  );

  const embed = updateEmbed(game);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("up").setLabel("⬆️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("down").setLabel("⬇️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("left").setLabel("⬅️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("right").setLabel("➡️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("check").setLabel("✅").setStyle(ButtonStyle.Success)
  );

  const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 5 * 60 * 1000 });

  collector.on("collect", async i => {
    if (i.user.id !== userId) return i.reply({ content: "❌ あなたのゲームではありません", ephemeral: true });

    let game = await client.db.collection("treasureGames").findOne({ userId, status: "playing" });
    if (!game) return i.update({ content: "❌ ゲームが見つかりません", components: [], embeds: [] });

    if (["up","down","left","right"].includes(i.customId)) {
      let { x, y } = game.position;
      if (i.customId === "up" && y > 0) y--;
      if (i.customId === "down" && y < 3) y++;
      if (i.customId === "left" && x > 0) x--;
      if (i.customId === "right" && x < 3) x++;
      game.position = { x, y };
      await client.db.collection("treasureGames").updateOne({ userId }, { $set: { "position": game.position } });
      await i.update({ embeds: [updateEmbed(game)], components: [row] });
      return;
    }

    if (i.customId === "check") {
      const { x, y } = game.position;
      if (game.checked[y][x] !== 0) {
        await i.reply({ content: "❌ すでにチェック済みのマスです", ephemeral: true });
        return;
      }

      const hit = game.board[y][x] === 1;
      if (hit) {
        game.checked[y][x] = 2; // 当たり
        const reward = game.bet * 5;
        await client.updateCoins(userId, reward);
        const coinsAfter = await client.getCoins(userId);
        if (coinsAfter < 0) await client.setCoins(userId, 0);
        game.resultText = `🎉 成功！コイン +${reward} 獲得！`;
        game.status = "finished";
        await client.db.collection("treasureGames").updateOne({ userId }, { $set: game });
        await i.update({ embeds: [updateEmbed(game)], content: null, components: [] });
        collector.stop();
        return;
      } else {
        game.checked[y][x] = 1; // 外れ
        game.chances--;
        if (game.chances <= 0) {
          const loss = game.bet * 3;
          await client.updateCoins(userId, -loss);
          const coinsAfter = await client.getCoins(userId);
          if (coinsAfter < 0) await client.setCoins(userId, 0);
          game.resultText = `❌ 失敗…コイン -${loss}。ゲーム終了。`;
          game.status = "finished";
          await client.db.collection("treasureGames").updateOne({ userId }, { $set: game });
          await i.update({ embeds: [updateEmbed(game)], content: null, components: [] });
          collector.stop();
          return;
        } else {
          await client.db.collection("treasureGames").updateOne({ userId }, { $set: { checked: game.checked, chances: game.chances } });
          await i.update({ embeds: [updateEmbed(game)], components: [row] });
        }
      }
    }
  });

  collector.on("end", async () => {
    const game = await client.db.collection("treasureGames").findOne({ userId });
    if (game?.status === "playing") {
      game.status = "finished";
      game.resultText = "⌛ ゲーム時間切れです";
      await client.db.collection("treasureGames").updateOne({ userId }, { $set: game });
      await message.edit({ embeds: [updateEmbed(game)], components: [] });
    } else {
      await message.edit({ components: [] });
    }
  });
}
