import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import fs from "fs";
import path from "path";
import { combineCards } from "../python/combine.py";
import { getHandStrength } from "../utils/handStrength.js";

export const data = new SlashCommandBuilder()
  .setName("poker")
  .setDescription("4ラウンド制ポーカーゲームをプレイ！")
  .addIntegerOption(option =>
    option.setName("bet").setDescription("掛け金").setRequired(true)
  );

export async function execute(interaction) {
  const userId = interaction.user.id;
  const client = interaction.client;
  let initialBet = interaction.options.getInteger("bet");
  const userCoins = await client.getCoins(userId);

  if (userCoins < initialBet)
    return interaction.reply({ content: "💰 コインが足りません！", flags: 64 });

  // --- 初期設定 ---
  let playerBet = initialBet;
  let botBet = initialBet;
  let pot = playerBet + botBet;
  let round = 1;
  let playerFolded = false;
  let playerRevealed = 3;

  // --- デッキ生成 ---
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  let deck = suits.flatMap(s => ranks.map(r => r + s));
  deck.sort(() => Math.random() - 0.5);

  const playerCards = deck.splice(0, 5);
  const botCards = deck.splice(0, 5);

  // --- カード画像描画 ---
  const renderCards = async () => {
    const imgPath = path.resolve(__dirname, `../tmp/poker_${userId}.png`);
    await combineCards(playerCards, botCards, playerRevealed, imgPath);
    return imgPath;
  };

  // --- Bot行動 ---
  const botAction = (playerBet, botBet, botCards) => {
    const strength = getHandStrength(botCards);
    const diff = playerBet - botBet;
    const r = Math.random();
    const bluffRate = 0.15;

    if (strength <= 3) {
      if (diff > 0) return r < bluffRate ? { action: "raise", amount: Math.floor(playerBet * 1.1) } : { action: "fold" };
      return r < 0.5 ? { action: "call" } : { action: "fold" };
    }
    if (strength <= 6) {
      if (diff > 0) return r < 0.7 ? { action: "call" } : { action: "fold" };
      const raiseAmount = Math.floor(playerBet * 1.2 + Math.random() * 3000);
      return r < 0.3 ? { action: "raise", amount: raiseAmount } : { action: "call" };
    }
    if (diff > 0) return { action: "call" };
    const raiseAmount = Math.floor(playerBet * 1.25 + Math.random() * 5000);
    return r < 0.7 ? { action: "raise", amount: raiseAmount } : { action: "call" };
  };

  // --- 次ラウンド ---
  const nextRound = async (btn) => {
    if (round >= 4 || playerFolded) return showResult(btn);
    round++;
    playerRevealed = Math.min(5, playerRevealed + 1);
    const img = await renderCards();
    const embed = new EmbedBuilder()
      .setTitle(`🎲 第${round}ラウンド`)
      .setDescription(`カードが1枚公開されました。\nポット: ${pot} コイン`)
      .setImage("attachment://cards.png");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("bet").setLabel("ベット +1000").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("call").setLabel("コール").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("fold").setLabel("フォールド").setStyle(ButtonStyle.Danger)
    );

    await btn.update({ embeds: [embed], components: [row], files: [{ attachment: img, name: "cards.png" }] });
  };

  // --- 勝敗表示 ---
  const showResult = async (btn) => {
    const img = await renderCards();
    const playerPower = getHandStrength(playerCards);
    const botPower = getHandStrength(botCards);

    let result = "";
    let multiplier = Math.min(5, 1 + pot / 20000);

    if (playerFolded) {
      const refund = Math.floor(playerBet / 2);
      await client.updateCoins(userId, refund);
      result = `😞 フォールドしました。ベットの半額 ${refund} コイン返却`;
    } else if (playerPower > botPower) {
      const win = Math.floor(playerBet * multiplier);
      await client.updateCoins(userId, win);
      result = `🎉 勝ち！ +${win} コイン`;
    } else if (playerPower === botPower) {
      const refund = Math.floor(playerBet / 2);
      await client.updateCoins(userId, refund);
      result = `🤝 引き分け。ベットの半分返却: ${refund} コイン`;
    } else {
      result = `💀 負けです。`;
    }

    const embed = new EmbedBuilder()
      .setTitle("🎯 結果発表")
      .setDescription(result)
      .setImage("attachment://cards.png");

    await btn.update({ embeds: [embed], components: [], files: [{ attachment: img, name: "cards.png" }] });
  };

  // --- 初期ラウンド表示 ---
  const img = await renderCards();
  const embed = new EmbedBuilder()
    .setTitle("🃏 ポーカー開始！")
    .setDescription(`掛け金: ${playerBet} コイン\n最初の3枚が公開されました。\nポット: ${pot} コイン`)
    .setImage("attachment://cards.png");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("bet").setLabel("ベット +1000").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("call").setLabel("コール").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("fold").setLabel("フォールド").setStyle(ButtonStyle.Danger)
  );

  // 初期ベット分を即引き
  await client.updateCoins(userId, -playerBet);

  const reply = await interaction.reply({ embeds: [embed], components: [row], files: [{ attachment: img, name: "cards.png" }] });

  const collector = reply.createMessageComponentCollector({ time: 60000 });

  collector.on("collect", async (btn) => {
    if (btn.user.id !== userId) return btn.reply({ content: "❌ 他の人は操作できません！", flags: 64 });

    // フォールド
    if (btn.customId === "fold") {
      playerFolded = true;
      return showResult(btn);
    }

    // ベット追加
    if (btn.customId === "bet") {
      playerBet += 1000;
      pot += 1000;
      await client.updateCoins(userId, -1000); // 即減算
    }

    // コールチェック
    if (btn.customId === "call") {
      if (playerBet < botBet) {
        return btn.reply({ content: `❌ まず ${botBet - playerBet} コインを追加ベットしてください！`, flags: 64 });
      }
    }

    // Bot行動
    const botMove = botAction(playerBet, botBet, botCards);
    if (botMove.action === "fold") {
      await client.updateCoins(userId, pot);
      return btn.update({ content: `🤖 Botがフォールド！あなたの勝ち！ +${pot}`, components: [], embeds: [], files: [] });
    } else if (botMove.action === "raise") {
      botBet += botMove.amount;
      pot += botMove.amount;
      return btn.update({ content: `🤖 Botがレイズ！ +${botMove.amount} コイン\n合計ポット: ${pot}`, components: [], embeds: [] });
    }

    await nextRound(btn);
  });

  // --- タイムアウト処理 ---
  collector.on("end", async (collected, reason) => {
    if (reason === "time" && !playerFolded && round < 4) {
      // ベット全額返却
      await client.updateCoins(userId, playerBet);
      return reply.edit({
        content: `⌛ タイムアウトです。ベットした金額 ${playerBet} コインを返却しました。`,
        embeds: [],
        components: []
      });
    }
  });
}
