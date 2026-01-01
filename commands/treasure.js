import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ComponentType
} from "discord.js";

// ===== メモリ上のゲーム管理 =====
const activeGames = new Map();

export const data = new SlashCommandBuilder()
  .setName("treasure")
  .setDescription("4x4宝探しゲームを開始します")
  .addIntegerOption(option =>
    option
      .setName("bet")
      .setDescription("掛け金")
      .setRequired(true)
      .setMinValue(100)
  );

// ===== 当たり配置 =====
function pickResult(jobName = "無職") {
  const board = Array.from({ length: 4 }, () => Array(4).fill(0));
  const hitCount = jobName === "ギャンブラー" ? 2 : 1;

  const set = new Set();
  while (set.size < hitCount) {
    set.add(Math.floor(Math.random() * 16));
  }

  for (const n of set) {
    const x = n % 4;
    const y = Math.floor(n / 4);
    board[y][x] = 1;
  }

  return board;
}

// ===== 盤面描画 =====
function renderBoard(game) {
  let text = "";

  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const checked = game.checked[y][x];

      if (game.showPlayer && game.position.x === x && game.position.y === y) {
        text += "🟡";
      } else if (checked === 2) {
        text += "🟩";
      } else if (checked === 1) {
        text += "🟫";
      } else {
        text += "⬜";
      }
    }
    text += "\n";
  }

  if (game.resultText) {
    text += `\n${game.resultText}`;
  }

  return text;
}

function buildEmbed(game) {
  return new EmbedBuilder()
    .setTitle("🎯 宝探しゲーム")
    .setDescription(renderBoard(game))
    .setFooter({ text: `残りチェック回数: ${game.chances}` })
    .setColor("#FFD700");
}

export async function execute(interaction, { client }) {
  const bet = interaction.options.getInteger("bet");
  const userId = interaction.user.id;

  const coins = await client.getCoins(userId);
  if (coins < bet) {
    return interaction.reply({
      content: `所持コインが足りません（現在: ${coins}）`,
      ephemeral: true
    });
  }

  const jobDoc = await client.db.collection("jobs").findOne({ userId });
  const jobName = jobDoc?.job || "無職";

  const game = {
    userId,
    board: pickResult(jobName),
    checked: Array.from({ length: 4 }, () => Array(4).fill(0)),
    position: { x: 3, y: 0 },
    chances: 5,
    bet,
    showPlayer: true,
    resultText: ""
  };

  activeGames.set(userId, game);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("up").setLabel("⬆️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("down").setLabel("⬇️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("left").setLabel("⬅️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("right").setLabel("➡️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("check").setLabel("✅").setStyle(ButtonStyle.Success)
  );

  const message = await interaction.reply({
    embeds: [buildEmbed(game)],
    components: [row],
    fetchReply: true
  });

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 5 * 60 * 1000
  });

  collector.on("collect", async i => {
    if (i.user.id !== userId) {
      return i.reply({ content: "❌ あなたのゲームではありません", ephemeral: true });
    }

    const game = activeGames.get(userId);
    if (!game) return;

    // ===== 移動 =====
    if (["up", "down", "left", "right"].includes(i.customId)) {
      let { x, y } = game.position;
      if (i.customId === "up" && y > 0) y--;
      if (i.customId === "down" && y < 3) y++;
      if (i.customId === "left" && x > 0) x--;
      if (i.customId === "right" && x < 3) x++;
      game.position = { x, y };
      return i.update({ embeds: [buildEmbed(game)], components: [row] });
    }

    // ===== チェック =====
    if (i.customId === "check") {
      const { x, y } = game.position;

      if (game.checked[y][x] !== 0) {
        return i.reply({ content: "❌ すでにチェック済みです", ephemeral: true });
      }

      // 当たり
      if (game.board[y][x] === 1) {
        game.checked[y][x] = 2;
        game.showPlayer = false;

        const reward = game.bet * 5;
        await client.updateCoins(userId, reward);
        if (await client.getCoins(userId) < 0) await client.setCoins(userId, 0);

        game.resultText = `成功！\n +${reward} コイン`;
        activeGames.delete(userId);
        collector.stop();

        return i.update({ embeds: [buildEmbed(game)], components: [] });
      }

      // 外れ
      game.checked[y][x] = 1;
      game.chances--;

      // 右上に戻す
      game.position = { x: 3, y: 0 };

      if (game.chances <= 0) {
        const loss = game.bet * 3;
        await client.updateCoins(userId, -loss);
        if (await client.getCoins(userId) < 0) await client.setCoins(userId, 0);

        game.resultText = `失敗\n-${loss} コイン`;
        activeGames.delete(userId);
        collector.stop();

        return i.update({ embeds: [buildEmbed(game)], components: [] });
      }

      return i.update({ embeds: [buildEmbed(game)], components: [row] });
    }
  });

  collector.on("end", async () => {
    const game = activeGames.get(userId);
    if (!game) return;

    game.resultText = "⌛ 時間切れです";
    activeGames.delete(userId);

    await message.edit({ embeds: [buildEmbed(game)], components: [] });
  });
}
