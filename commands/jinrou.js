import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
} from "discord.js";

/*
  ===============================
  人狼ゲーム 状態管理
  ===============================
  DB保存:
  guildId:
  {
    channelId,
    phase: "lobby" | "night" | "day" | "vote" | "end",
    hostId,
    players: [
      { userId, role, alive: true, voted: false }
    ],
    day: 1,
    rolesPool: [],
    votes: {},
  }
*/

const ROLE_LIST = [
  "村人",
  "人狼",
  "騎士",
  "占い師",
  "妖狐",
  "霊媒師",
  "狂人",
  "猫又",
  "怪盗",
  "てるてる",
  "自宅警備員",
];

function getWolfCount(playerCount) {
  if (playerCount < 6) return 1;
  if (playerCount < 10) return 2;
  return 3;
}

export const data = new SlashCommandBuilder()
  .setName("jinrou")
  .setDescription("人狼ゲームを開始 / 状態操作");

/* ===============================
   メイン実行
================================= */

export async function execute(interaction) {
  const client = interaction.client;
  const guildId = interaction.guild.id;
  const channel = interaction.channel;

  if (!channel || channel.type !== ChannelType.GuildText) {
    return interaction.reply({ content: "テキストチャンネルで実行してください", ephemeral: true });
  }

  let game = await client.db.collection("jinrou").findOne({ guildId });

  if (!game) {
    // 初回作成（ロビー）
    game = {
      guildId,
      channelId: channel.id,
      phase: "lobby",
      hostId: interaction.user.id,
      players: [],
      rolesPool: [],
      day: 1,
      votes: {},
    };

    await client.db.collection("jinrou").insertOne(game);
  }

  // ゲーム中なら状態操作
  if (game.phase !== "lobby") {
    return gameControlPanel(interaction, game);
  }

  return lobbyPanel(interaction, game);
}

/* ===============================
   ロビー画面
================================= */

async function lobbyPanel(interaction, game) {
  const client = interaction.client;

  const embed = new EmbedBuilder()
    .setTitle("人狼ゲーム - ロビー")
    .setDescription(
      `進行権: <@${game.hostId}>\n\n` +
      `参加人数: ${game.players.length}\n\n` +
      game.players.map(p => `・<@${p.userId}>`).join("\n")
    )
    .setColor("Blue");

  const joinBtn = new ButtonBuilder()
    .setCustomId("jinrou_join")
    .setLabel("参加")
    .setStyle(ButtonStyle.Success);

  const startBtn = new ButtonBuilder()
    .setCustomId("jinrou_start")
    .setLabel("ゲーム開始")
    .setStyle(ButtonStyle.Primary);

  const roleSelect = new StringSelectMenuBuilder()
    .setCustomId("jinrou_roles")
    .setPlaceholder("追加役職を選択")
    .setMinValues(0)
    .setMaxValues(ROLE_LIST.length)
    .addOptions(
      ROLE_LIST.map(r => ({
        label: r,
        value: r,
      }))
    );

  const row1 = new ActionRowBuilder().addComponents(joinBtn, startBtn);
  const row2 = new ActionRowBuilder().addComponents(roleSelect);

  await interaction.reply({
    embeds: [embed],
    components: [row1, row2],
  });

  await handleLobbyInteractions(interaction);
}

/* ===============================
   ロビーインタラクション
================================= */

async function handleLobbyInteractions(interaction) {
  const client = interaction.client;

  client.on("interactionCreate", async (i) => {
    if (!i.isButton() && !i.isStringSelectMenu()) return;
    if (i.message.id !== interaction.message.id) return;

    const game = await client.db.collection("jinrou").findOne({
      guildId: i.guild.id,
    });

    if (!game) return;

    /* 参加 */
    if (i.customId === "jinrou_join") {
      if (!game.players.find(p => p.userId === i.user.id)) {
        game.players.push({ userId: i.user.id, role: null, alive: true, voted: false });
        await client.db.collection("jinrou").updateOne(
          { guildId: i.guild.id },
          { $set: { players: game.players } }
        );
      }

      return i.reply({ content: "参加しました", ephemeral: true });
    }

    /* 役職選択 */
    if (i.customId === "jinrou_roles") {
      game.rolesPool = i.values;

      await client.db.collection("jinrou").updateOne(
        { guildId: i.guild.id },
        { $set: { rolesPool: game.rolesPool } }
      );

      return i.reply({ content: "役職更新", ephemeral: true });
    }

    /* 開始 */
    if (i.customId === "jinrou_start") {
      if (game.players.length < 4) {
        return i.reply({ content: "参加人数不足", ephemeral: true });
      }

      await startGame(i, game);
    }
  });
}

/* ===============================
   ゲーム開始
================================= */

async function startGame(interaction, game) {
  const client = interaction.client;
  const guild = interaction.guild;

  const wolfCount = getWolfCount(game.players.length);

  // 役職抽選
  let roles = [];

  const baseRoles = ["人狼"];
  for (let i = 0; i < wolfCount; i++) roles.push("人狼");

  roles.push("村人");

  if (game.rolesPool.length > 0) {
    roles = roles.concat(game.rolesPool);
  }

  // 不足分は村人
  while (roles.length < game.players.length) {
    roles.push("村人");
  }

  // 余分はランダム削除
  if (roles.length > game.players.length) {
    roles = roles.sort(() => Math.random() - 0.5).slice(0, game.players.length);
  }

  // シャッフル
  roles = roles.sort(() => Math.random() - 0.5);

  game.players.forEach((player, idx) => {
    player.role = roles[idx];
  });

  game.phase = "night";

  await client.db.collection("jinrou").updateOne(
    { guildId: guild.id },
    { $set: game }
  );

  // DM配布
  for (const p of game.players) {
    const user = await guild.members.fetch(p.userId);
    const embed = new EmbedBuilder()
      .setTitle("人狼ゲーム")
      .setDescription(
        `チャンネル: ${guild.name}\n\n` +
        `あなたの役職:\n${p.role}`
      )
      .setColor("Green");

    await user.send({ embeds: [embed] }).catch(() => {});
  }

  await interaction.reply({
    content: "役職配布完了。夜フェーズ開始。",
    ephemeral: false,
  });
}

/* ===============================
   ゲーム中操作（朝/夜切替・終了）
================================= */

async function gameControlPanel(interaction, game) {
  const switchBtn = new ButtonBuilder()
    .setCustomId("jinrou_toggle_day")
    .setLabel("昼/夜切替")
    .setStyle(ButtonStyle.Secondary);

  const endBtn = new ButtonBuilder()
    .setCustomId("jinrou_force_end")
    .setLabel("強制終了")
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(switchBtn, endBtn);

  await interaction.reply({
    content: "ゲーム進行操作",
    components: [row],
    ephemeral: true,
  });

  interaction.client.on("interactionCreate", async (i) => {
    if (!i.isButton()) return;
    if (!["jinrou_toggle_day", "jinrou_force_end"].includes(i.customId)) return;

    if (i.customId === "jinrou_force_end") {
      await client.db.collection("jinrou").deleteOne({ guildId: game.guildId });
      return i.reply({ content: "ゲーム終了", ephemeral: true });
    }

    if (i.customId === "jinrou_toggle_day") {
      game.phase = game.phase === "night" ? "day" : "night";

      await client.db.collection("jinrou").updateOne(
        { guildId: game.guildId },
        { $set: { phase: game.phase } }
      );

      return i.reply({ content: `フェーズ変更: ${game.phase}`, ephemeral: true });
    }
  });
}

export default { data, execute };

/* =========================================================
   昼フェーズ開始
========================================================= */

async function startDayPhase(client, game) {
  game.phase = "day";
  game.votes = {};

  await client.db.collection("jinrou").updateOne(
    { guildId: game.guildId },
    { $set: { phase: "day", votes: {} } }
  );

  const channel = await client.channels.fetch(game.channelId);

  const voteMenu = new StringSelectMenuBuilder()
    .setCustomId("jinrou_vote")
    .setPlaceholder("処刑対象を選択")
    .addOptions(
      game.players
        .filter(p => p.alive)
        .map(p => ({
          label: p.userId,
          value: p.userId,
        }))
        .concat({
          label: "投票スキップ",
          value: "skip",
        })
    );

  const row = new ActionRowBuilder().addComponents(voteMenu);

  const embed = new EmbedBuilder()
    .setTitle("人狼ゲーム - 処刑投票")
    .setDescription(
      `これから ${game.day} 日目 昼の投票を行います\n\n` +
      `各プレイヤーは対象を選択してください`
    )
    .setColor("Orange");

  await channel.send({ embeds: [embed], components: [row] });

  handleVoteInteraction(client);
}

/* =========================================================
   投票処理
========================================================= */

function handleVoteInteraction(client) {
  client.on("interactionCreate", async (i) => {
    if (!i.isStringSelectMenu()) return;
    if (i.customId !== "jinrou_vote") return;

    const game = await client.db.collection("jinrou").findOne({
      guildId: i.guild.id,
    });

    if (!game || game.phase !== "day") return;

    game.votes[i.user.id] = i.values[0];

    await client.db.collection("jinrou").updateOne(
      { guildId: i.guild.id },
      { $set: { votes: game.votes } }
    );

    await i.reply({ content: "投票完了", ephemeral: true });

    await checkVoteResult(client, game);
  });
}

/* =========================================================
   投票集計
========================================================= */

async function checkVoteResult(client, game) {
  const votes = game.votes;
  const alivePlayers = game.players.filter(p => p.alive);

  if (Object.keys(votes).length < alivePlayers.length) return;

  const count = {};

  for (const v of Object.values(votes)) {
    if (!count[v]) count[v] = 0;
    count[v]++;
  }

  const max = Math.max(...Object.values(count));
  const candidates = Object.keys(count).filter(k => count[k] === max);

  let eliminated = null;

  if (candidates.length === 1 && candidates[0] !== "skip") {
    eliminated = candidates[0];
  }

  const channel = await client.channels.fetch(game.channelId);

  if (!eliminated) {
    await channel.send("同票またはスキップ。処刑なし。");
  } else {
    game.players = game.players.map(p =>
      p.userId === eliminated ? { ...p, alive: false } : p
    );

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("処刑結果")
          .setDescription(`${eliminated} は投票の結果処刑された`)
          .setColor("Red"),
      ],
    });
  }

  game.day += 1;
  game.phase = "night";
  game.votes = {};

  await client.db.collection("jinrou").updateOne(
    { guildId: game.guildId },
    { $set: game }
  );

  await checkWinCondition(client, game);
}

/* =========================================================
   勝利判定
========================================================= */

async function checkWinCondition(client, game) {
  const alive = game.players.filter(p => p.alive);
  const wolves = alive.filter(p => p.role === "人狼");
  const villagers = alive.filter(p => p.role !== "人狼");

  const channel = await client.channels.fetch(game.channelId);

  // 人狼全滅
  if (wolves.length === 0) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("村人陣営の勝利")
          .setDescription("人狼は全滅した")
          .setColor("Green"),
      ],
    });
    await showRoleList(channel, game);
    return endGame(client, game);
  }

  // 人狼 >= 村人数
  if (wolves.length >= villagers.length) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("人狼陣営の勝利")
          .setDescription("村は制圧された")
          .setColor("DarkRed"),
      ],
    });
    await showRoleList(channel, game);
    return endGame(client, game);
  }
}

/* =========================================================
   役職一覧表示
========================================================= */

async function showRoleList(channel, game) {
  const desc = game.players
    .map(p => {
      const status = p.alive ? "" : "(死亡)";
      return `・<@${p.userId}> - ${p.role} ${status}`;
    })
    .join("\n");

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("参加者役職一覧")
        .setDescription(desc)
        .setColor("Purple"),
    ],
  });

  // 役職DM終了表示
  for (const p of game.players) {
    try {
      const member = await channel.guild.members.fetch(p.userId);
      await member.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("人狼ゲーム")
            .setDescription("このゲームは終了しました")
            .setColor("Grey"),
        ],
      });
    } catch {}
  }
}

/* =========================================================
   ゲーム終了
========================================================= */

async function endGame(client, game) {
  await client.db.collection("jinrou").deleteOne({
    guildId: game.guildId,
  });
}

/* =========================================================
   夜フェーズ開始
========================================================= */

async function startNightPhase(client, game) {
  game.phase = "night";

  await client.db.collection("jinrou").updateOne(
    { guildId: game.guildId },
    { $set: { phase: "night" } }
  );

  const channel = await client.channels.fetch(game.channelId);

  const alive = game.players.filter(p => p.alive);

  // 夜行動UI
  const targetSelect = new StringSelectMenuBuilder()
    .setCustomId("jinrou_night_action")
    .setPlaceholder("夜の対象を選択")
    .addOptions(
      alive.map(p => ({
        label: p.userId,
        value: p.userId,
      }))
    );

  const row = new ActionRowBuilder().addComponents(targetSelect);

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("夜フェーズ")
        .setDescription("夜行動を選択してください")
        .setColor("DarkBlue"),
    ],
    components: [row],
  });

  handleNightAction(client);
}

/* =========================================================
   夜行動処理
========================================================= */

function handleNightAction(client) {
  client.on("interactionCreate", async (i) => {
    if (!i.isStringSelectMenu()) return;
    if (i.customId !== "jinrou_night_action") return;

    const game = await client.db.collection("jinrou").findOne({
      guildId: i.guild.id,
    });

    if (!game || game.phase !== "night") return;

    const player = game.players.find(p => p.userId === i.user.id);
    if (!player || !player.alive) {
      return i.reply({ content: "夜行動不可", ephemeral: true });
    }

    const targetId = i.values[0];

    await processRoleAbility(client, game, player, targetId);

    await i.reply({ content: "夜行動完了", ephemeral: true });
  });
}

/* =========================================================
   役職能力処理
========================================================= */

async function processRoleAbility(client, game, player, targetId) {
  const target = game.players.find(p => p.userId === targetId);
  if (!target) return;

  switch (player.role) {

    case "人狼":
      // 人狼は対象を夜殺害
      target.alive = false;
      break;

    case "占い師":
      // 占い結果通知
      const result = target.role === "人狼" ? "人狼" : "人狼ではない";

      const member = await client.guilds.cache
        .get(game.guildId)
        .members.fetch(player.userId);

      await member.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("占い結果")
            .setDescription(`${targetId} は ${result}`)
            .setColor("Gold"),
        ],
      });
      break;

    case "騎士":
      // 守護対象保存
      game.guardTarget = targetId;
      break;

    case "怪盗":
      // 役職盗み
      const stolenRole = target.role;
      player.role = stolenRole;
      target.role = "村人";
      player.stolen = true;
      break;

    default:
      break;
  }

  await client.db.collection("jinrou").updateOne(
    { guildId: game.guildId },
    { $set: game }
  );
}

/* =========================================================
   夜終了処理
========================================================= */

async function endNight(client, game) {
  const channel = await client.channels.fetch(game.channelId);

  // 騎士守護判定
  if (game.guardTarget) {
    const victim = game.players.find(
      p => p.userId === game.guardTarget && !p.alive
    );
    if (victim) victim.alive = true;
  }

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("朝になりました")
        .setDescription("夜の結果を反映しました")
        .setColor("Yellow"),
    ],
  });

  await client.db.collection("jinrou").updateOne(
    { guildId: game.guildId },
    { $set: game }
  );

  await startDayPhase(client, game);
}

/* =========================================================
   特殊死亡処理
========================================================= */

async function handleSpecialDeath(client, game, deadPlayer) {
  const channel = await client.channels.fetch(game.channelId);

  /* =========================
     猫又処理
  ========================== */
  if (deadPlayer.role === "猫又") {
    const aliveOthers = game.players.filter(
      p => p.alive && p.userId !== deadPlayer.userId
    );

    if (aliveOthers.length > 0) {
      const target = aliveOthers[Math.floor(Math.random() * aliveOthers.length)];
      target.alive = false;

      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("猫又道連れ")
            .setDescription(`${target.userId} が道連れにされた`)
            .setColor("DarkRed"),
        ],
      });
    }
  }

  /* =========================
     てるてる処刑勝利
  ========================== */
  if (deadPlayer.role === "てるてる") {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("てるてる勝利")
          .setDescription("てるてるが処刑されたため単独勝利")
          .setColor("Pink"),
      ],
    });

    await showRoleList(channel, game);
    await endGame(client, game);
  }

  /* =========================
     妖狐処理
  ========================== */
  if (deadPlayer.role === "妖狐") {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("妖狐死亡")
          .setDescription("妖狐が死亡しました")
          .setColor("Purple"),
      ],
    });
  }

  await client.db.collection("jinrou").updateOne(
    { guildId: game.guildId },
    { $set: game }
  );
}

/* =========================================================
   妖狐横取り勝利判定
========================================================= */

async function checkFoxVictory(client, game) {
  const fox = game.players.find(
    p => p.role === "妖狐" && p.alive
  );

  if (!fox) return;

  const aliveWolves = game.players.filter(
    p => p.alive && p.role === "人狼"
  );

  // 人狼勝利条件成立時に妖狐生存なら横取り
  if (aliveWolves.length >=
      game.players.filter(p => p.alive && p.role !== "人狼").length) {

    const channel = await client.channels.fetch(game.channelId);

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("妖狐横取り勝利")
          .setDescription("妖狐が勝利を横取りしました")
          .setColor("Purple"),
      ],
    });

    await showRoleList(channel, game);
    await endGame(client, game);
  }
}

/* =========================================================
   勝利判定強化（拡張版）
========================================================= */

async function checkWinConditionExtended(client, game) {
  await checkWinCondition(client, game);
  await checkFoxVictory(client, game);

  const alive = game.players.filter(p => p.alive);

  const teru = alive.find(p => p.role === "てるてる");
  if (teru && game.phase === "end") {
    return;
  }
}

/* =========================================================
   夜終了時に追加処理
========================================================= */

async function finalizeNightPhase(client, game) {

  // 死亡者取得
  const deadPlayers = game.players.filter(
    p => !p.alive && !p.processed
  );

  for (const dead of deadPlayers) {
    await handleSpecialDeath(client, game, dead);
    dead.processed = true;
  }

  await client.db.collection("jinrou").updateOne(
    { guildId: game.guildId },
    { $set: game }
  );

  await checkWinConditionExtended(client, game);
}


/* =========================================================
   イベントリスナー重複防止用フラグ
========================================================= */

if (!global.__jinrouListenerInitialized) {
  global.__jinrouListenerInitialized = true;

  /* ================================
     夜アクション監視
  ================================ */
  client.on("interactionCreate", async (i) => {
    if (!i.isStringSelectMenu()) return;
    if (!i.customId.startsWith("jinrou_")) return;

    const game = await client.db.collection("jinrou").findOne({
      guildId: i.guild.id,
    });

    if (!game) return;

    /* 夜行動自動終了チェック */
    if (game.phase === "night") {
      const alive = game.players.filter(p => p.alive);
      const actedCount = new Set(Object.keys(game.nightActions || {})).size;

      if (actedCount >= alive.length) {
        await finalizeNightPhase(client, game);
      }
    }
  });
}

/* =========================================================
   夜行動保存（複数人狼対応）
========================================================= */

async function registerNightAction(client, game, userId, targetId) {

  if (!game.nightActions) game.nightActions = {};

  game.nightActions[userId] = targetId;

  await client.db.collection("jinrou").updateOne(
    { guildId: game.guildId },
    { $set: { nightActions: game.nightActions } }
  );
}

/* =========================================================
   人狼夜攻撃集計
========================================================= */

async function resolveWolfAttack(client, game) {

  const attacks = Object.values(game.nightActions || {})
    .filter((_, idx) => true);

  if (attacks.length === 0) return;

  const targetId = attacks[Math.floor(Math.random() * attacks.length)];
  const victim = game.players.find(p => p.userId === targetId);

  if (!victim || !victim.alive) return;

  victim.alive = false;

  const channel = await client.channels.fetch(game.channelId);

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("夜の襲撃")
        .setDescription(`${targetId} が人狼に襲撃され死亡`)
        .setColor("DarkRed"),
    ],
  });
}

/* =========================================================
   夜フェーズ自動タイマー
========================================================= */

async function startNightTimer(client, game) {

  const NIGHT_DURATION = 60 * 1000; // 60秒

  setTimeout(async () => {

    const updated = await client.db.collection("jinrou").findOne({
      guildId: game.guildId,
    });

    if (!updated || updated.phase !== "night") return;

    await resolveWolfAttack(client, updated);
    await finalizeNightPhase(client, updated);

  }, NIGHT_DURATION);
}

/* =========================================================
   昼フェーズ自動タイマー
========================================================= */

async function startDayTimer(client, game) {

  const DAY_DURATION = 90 * 1000;

  setTimeout(async () => {

    const updated = await client.db.collection("jinrou").findOne({
      guildId: game.guildId,
    });

    if (!updated || updated.phase !== "day") return;

    await checkVoteResult(client, updated);

  }, DAY_DURATION);
}

/* =========================================================
   フェーズ変更ユーティリティ
========================================================= */

async function changePhase(client, game, newPhase) {

  game.phase = newPhase;

  await client.db.collection("jinrou").updateOne(
    { guildId: game.guildId },
    { $set: { phase: newPhase } }
  );

  if (newPhase === "night") {
    await startNightTimer(client, game);
  }

  if (newPhase === "day") {
    await startDayTimer(client, game);
  }
}

/* =========================================================
   強制終了（安全終了）
========================================================= */

async function forceEndGame(client, guildId) {

  const game = await client.db.collection("jinrou").findOne({ guildId });

  if (!game) return;

  const channel = await client.channels.fetch(game.channelId);

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("ゲーム強制終了")
        .setDescription("進行権によりゲームが終了しました")
        .setColor("Grey"),
    ],
  });

  await showRoleList(channel, game);

  await client.db.collection("jinrou").deleteOne({ guildId });
}

/* =========================================================
   状態再描画
   (常に最新DBを取得して表示を更新)
========================================================= */

async function refreshGamePanel(client, guildId) {

  const game = await client.db.collection("jinrou").findOne({ guildId });
  if (!game) return;

  const channel = await client.channels.fetch(game.channelId);

  const embed = new EmbedBuilder()
    .setTitle("人狼ゲーム - 現在状態")
    .setDescription(
      `フェーズ: ${game.phase}\n` +
      `日数: ${game.day}\n\n` +
      `参加人数: ${game.players.length}\n` +
      game.players
        .map(p => `・<@${p.userId}> ${p.alive ? "生存" : "死亡"}`)
        .join("\n")
    )
    .setColor("Blue");

  const btnStartNight = new ButtonBuilder()
    .setCustomId("jinrou_force_night")
    .setLabel("夜へ")
    .setStyle(ButtonStyle.Secondary);

  const btnStartDay = new ButtonBuilder()
    .setCustomId("jinrou_force_day")
    .setLabel("昼へ")
    .setStyle(ButtonStyle.Secondary);

  const btnEnd = new ButtonBuilder()
    .setCustomId("jinrou_force_end")
    .setLabel("ゲーム終了")
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(
    btnStartNight,
    btnStartDay,
    btnEnd
  );

  await channel.send({
    embeds: [embed],
    components: [row],
  });
}

/* =========================================================
   強制フェーズ切替ボタン統一管理
========================================================= */

client.on("interactionCreate", async (i) => {

  if (!i.isButton()) return;
  if (!i.customId.startsWith("jinrou_")) return;

  const game = await client.db.collection("jinrou").findOne({
    guildId: i.guild.id,
  });

  if (!game) return;

  /* 進行権チェック */
  if (i.user.id !== game.hostId) {
    return i.reply({
      content: "進行権を持つ人のみ操作可能",
      ephemeral: true,
    });
  }

  if (i.customId === "jinrou_force_night") {
    await changePhase(i.client, game, "night");
    return i.reply({ content: "夜に変更", ephemeral: true });
  }

  if (i.customId === "jinrou_force_day") {
    await changePhase(i.client, game, "day");
    return i.reply({ content: "昼に変更", ephemeral: true });
  }

  if (i.customId === "jinrou_force_end") {
    await forceEndGame(i.client, i.guild.id);
    return i.reply({ content: "ゲーム終了", ephemeral: true });
  }
});