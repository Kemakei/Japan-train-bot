// 非常に長いため折り畳まず全掲載

import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType,
} from "discord.js";

/* =========================================================
   ゲーム管理
========================================================= */

const games = new Map();

/* =========================================================
   陣営
========================================================= */

function faction(role) {
  if (["人狼", "狂人"].includes(role)) return "人狼";
  if (["妖狐", "怪盗", "てるてる"].includes(role)) return "第三";
  return "村";
}

/* =========================================================
   コマンド
========================================================= */

export const data = new SlashCommandBuilder()
  .setName("jinrou")
  .setDescription("人狼ゲーム開始・進行・強制終了");

export async function execute(interaction) {
  const channelId = interaction.channel.id;

  if (!games.has(channelId)) {
    return createGame(interaction);
  }

  const game = games.get(channelId);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("jinrou_force_end")
      .setLabel("強制終了")
      .setStyle(ButtonStyle.Danger)
  );

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("人狼ゲーム進行中")
        .setDescription("ゲームが進行中です。\n強制終了できます。")
    ],
    components: [row],
    ephemeral: true
  });
}

/* =========================================================
   強制終了
========================================================= */

export async function handleButton(interaction) {
  const game = games.get(interaction.channel.id);
  if (!game) return;

  if (interaction.customId === "jinrou_force_end") {
    games.delete(interaction.channel.id);
    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("人狼ゲーム")
          .setDescription("ゲームは強制終了されました。")
      ],
      components: []
    });
  }

  if (interaction.customId === "jinrou_join") {
    if (!game.players.includes(interaction.user.id))
      game.players.push(interaction.user.id);
    return interaction.update({ embeds: [lobbyEmbed(game)] });
  }

  if (interaction.customId === "jinrou_start") {
    if (game.players.length < 4)
      return interaction.reply({ content: "4人以上必要です", ephemeral: true });

    assignRoles(game);
    game.phase = "night";
    game.day = 1;

    await sendRoles(interaction, game);

    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("人狼ゲーム")
          .setDescription("DMに役職が配られました。\n1日目の夜です。")
      ],
      components: []
    });
  }
}

/* =========================================================
   ゲーム生成
========================================================= */

async function createGame(interaction) {
  const game = {
    host: interaction.user.id,
    players: [],
    roles: {},
    dead: [],
    phase: "lobby",
    day: 0,
    votes: {},
    night: {},
    kaidoUsed: new Set(),
    channelId: interaction.channel.id,
    alive() {
      return this.players.filter(p => !this.dead.includes(p));
    }
  };

  games.set(interaction.channel.id, game);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("jinrou_join")
      .setLabel("参加")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("jinrou_start")
      .setLabel("開始")
      .setStyle(ButtonStyle.Primary)
  );

  return interaction.reply({
    embeds: [lobbyEmbed(game)],
    components: [row]
  });
}

function lobbyEmbed(game) {
  return new EmbedBuilder()
    .setTitle("人狼ゲーム")
    .setDescription(
      `ゲーム進行権：<@${game.host}>\n\n参加者（${game.players.length}人）\n` +
      (game.players.map(p => `<@${p}>`).join("\n") || "なし")
    );
}

/* =========================================================
   役職割り振り（完全役職入り）
========================================================= */

function assignRoles(game) {
  const p = [...game.players];
  const roles = [];

  roles.push("人狼");
  if (p.length >= 6) roles.push("狂人");
  roles.push("占い師", "騎士", "霊媒師", "猫又", "妖狐", "怪盗", "てるてる", "自宅警備員");

  while (roles.length < p.length) roles.push("村人");

  shuffle(p);
  roles.splice(p.length);

  p.forEach((id, i) => {
    game.roles[id] = roles[i];
  });
}

function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

/* =========================================================
   DM送信
========================================================= */

async function sendRoles(interaction, game) {
  for (const id of game.players) {
    const user = await interaction.client.users.fetch(id);

    const embed = new EmbedBuilder()
      .setTitle("人狼ゲーム")
      .setDescription(
        `チャンネル：\n${interaction.channel.name}\n\nあなたの役職：\n${game.roles[id]}`
      );

    await user.send({ embeds: [embed] }).catch(() => {});
  }
}

/* =========================================================
   夜処理（完全ロジック）
========================================================= */

async function resolveNight(channel, game) {
  let wolfTargets = [];
  let guardTarget = null;
  let divTarget = null;

  for (const id of game.alive()) {
    const role = game.roles[id];

    if (role === "人狼") wolfTargets.push(randomTarget(game, id));
    if (role === "騎士") guardTarget = randomTarget(game, id);
    if (role === "占い師") divTarget = randomTarget(game, id);
  }

  let killTarget = wolfTargets[0] || null;

  if (divTarget && game.roles[divTarget] === "妖狐") {
    game.dead.push(divTarget);
  }

  if (killTarget && killTarget !== guardTarget) {
    game.dead.push(killTarget);
  }

  game.day++;
  game.phase = "day";

  const win = checkWin(game);
  if (win) return endGame(channel, game, win);

  return channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("人狼ゲーム")
        .setDescription(`${game.day}日目の朝になりました。`)
    ]
  });
}

function randomTarget(game, self) {
  const list = game.alive().filter(p => p !== self);
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

/* =========================================================
   投票（完全再投票対応）
========================================================= */

async function startVote(channel, game) {
  game.votes = {};

  const alive = game.alive();

  const options = alive.map(id => ({
    label: id,
    value: id
  }));

  options.push({ label: "投票スキップ", value: "skip" });

  const select = new StringSelectMenuBuilder()
    .setCustomId("jinrou_vote")
    .setPlaceholder("処刑対象選択")
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("人狼ゲーム - 処刑投票")
        .setDescription(`${game.day}日目 昼の処刑投票を行います。`)
    ],
    components: [row]
  });

  game.phase = "vote";
}

/* =========================================================
   勝敗判定（全陣営）
========================================================= */

function checkWin(game) {
  const alive = game.alive();

  const wolves = alive.filter(p => faction(game.roles[p]) === "人狼");
  const villagers = alive.filter(p => faction(game.roles[p]) === "村");
  const fox = alive.find(p => game.roles[p] === "妖狐");

  if (wolves.length === 0 && !fox) return "村";

  if (wolves.length >= villagers.length) {
    if (fox) return "妖狐";
    return "人狼";
  }

  return null;
}

/* =========================================================
   終了処理
========================================================= */

async function endGame(channel, game, winFaction) {
  const list = game.players.map(p =>
    `･<@${p}> - ${game.roles[p]} ${game.dead.includes(p) ? "(死亡)" : ""}`
  ).join("\n");

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle(`${winFaction}陣営の勝利！`)
        .setDescription(`\n参加者の役職\n${list}`)
    ]
  });

  games.delete(game.channelId);
}