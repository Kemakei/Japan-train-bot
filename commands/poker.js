import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
} from "discord.js";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pythonPath = path.resolve(__dirname, "../python/combine.py");
const pythonCmd = process.platform === "win32" ? "py" : "python3";

// --- ユーザー単位で進行中ゲーム管理 ---
const ongoingGames = new Map();

export const data = new SlashCommandBuilder()
  .setName("poker")
  .setDescription("Botと5枚ポーカーで勝負！");

export async function execute(interaction) {
  const client = interaction.client;
  const userId = interaction.user.id;

  if (ongoingGames.has(userId)) {
    return interaction.reply({
      content: "❌ 進行中のゲームがあります。まず終わらせてください！",
      flags: 64,
    });
  }

  const initialCoins = await client.getCoins(userId);
  let bet = 1000; // 初期ベット

  if (initialCoins < bet) {
    return interaction.reply({ content: "❌ コインが足りません！", flags: 64 });
  }

  ongoingGames.set(userId, true);

  await interaction.deferReply();

  // --- デッキ作成 ---
  const suits = ["S", "H", "D", "C"];
  const ranks = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const deck = [];
  for (const r of ranks) for (const s of suits) deck.push(r + s);
  deck.sort(() => Math.random() - 0.5);

  const playerHand = deck.splice(0, 5);
  let botHand = deck.splice(0, 5);

  const timestamp = Date.now();
  const combinedPath = path.resolve(__dirname, `../python/images/combined_${userId}_${timestamp}.png`);

  // --- Python で初期画像生成（コール前） ---
  const pythonArgs = [pythonPath, ...playerHand, ...botHand, "0", combinedPath];
  const pythonProc = spawn(pythonCmd, pythonArgs);

  pythonProc.on("error", async (err) => {
    console.error("Python 実行エラー:", err);
    ongoingGames.delete(userId);
    await interaction.editReply({ content: "❌ 画像生成中にエラーが発生しました", flags: 64 });
  });

  pythonProc.on("close", async (code) => {
    if (code !== 0) {
      ongoingGames.delete(userId);
      return await interaction.editReply({ content: "❌ Python スクリプトが異常終了しました", flags: 64 });
    }

    const file = new AttachmentBuilder(combinedPath);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("call").setLabel("コール").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("fold").setLabel("フォールド").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("bet100").setLabel("ベット +100").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("bet1000").setLabel("ベット +1000").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("bet10000").setLabel("ベット +10000").setStyle(ButtonStyle.Primary),
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("customBet").setLabel("💬 ベット指定").setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({
      content: `🎲 あなたの手札です。現在のベット: ${bet} コイン`,
      files: [file],
      components: [row, row2],
    });

    const filter = (btnInt) => {
      if (btnInt.user.id !== userId) {
        btnInt.reply({ content: "❌ あなたのゲームではありません！", flags: 64 });
        return false;
      }
      return true;
    };

    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

    collector.on("collect", async (btnInt) => {
      try {
        // --- 固定ベット ---
        if (btnInt.customId.startsWith("bet")) {
          const add =
            btnInt.customId === "bet100" ? 100 :
            btnInt.customId === "bet1000" ? 1000 :
            btnInt.customId === "bet10000" ? 10000 : 0;

          if (bet + add > (await client.getCoins(userId)) + bet) {
            return btnInt.reply({ content: "❌ コインが足りません！", flags: 64 });
          }

          await client.updateCoins(userId, -add);
          bet += add;
          await btnInt.update({ content: `🎲 現在のベット: ${bet} コイン`, components: [row, row2] });
          return;
        }

        // --- カスタムベット ---
        if (btnInt.customId === "customBet") {
          const modal = new ModalBuilder().setCustomId("customBetModal").setTitle("ベット金額を入力");

          const betInput = new TextInputBuilder()
            .setCustomId("betAmount")
            .setLabel("ベット金額（整数）")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("例: 50000")
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(betInput));
          await btnInt.showModal(modal);

          const submitted = await btnInt.awaitModalSubmit({ time: 30000 }).catch(() => null);
          if (!submitted) return;

          const betValue = Number(submitted.fields.getTextInputValue("betAmount"));
          if (isNaN(betValue) || betValue <= 0)
            return submitted.reply({ content: "❌ 無効な金額です", flags: 64 });

          const available = await client.getCoins(userId);
          if (betValue > available + bet)
            return submitted.reply({ content: "❌ コインが足りません！", flags: 64 });

          await client.updateCoins(userId, -betValue);
          bet += betValue;

          await submitted.update({ content: `🎲 現在のベット: ${bet} コイン`, components: [row, row2] });
          return;
        }

        // --- コール ---
        if (btnInt.customId === "call") {
          collector.stop("called");
          await btnInt.deferUpdate();

          // --- 段階制のbot強化倍率（無限増加） ---
          let bias = 1;
          if (bet <= 100000) {
            bias = 1 + (bet / 100000) * 2; // 1〜3倍
          } else {
            bias = 3 + Math.floor((bet - 100000) / 100000); // 10万ごとに +1倍
          }

          // bias を元に botHand を再生成する確率を調整
          const chance = Math.min(1, (bias - 1) / 3);
          if (Math.random() < chance) {
            deck.sort(() => Math.random() - 0.5);
            botHand = deck.splice(0, 5);
          }

          const pyArgs = [pythonPath, ...playerHand, ...botHand, "1", combinedPath]; // コール後は全公開
          const resultProc = spawn(pythonCmd, pyArgs);

          let stdout = "";
          resultProc.stdout.on("data", (data) => (stdout += data.toString()));
          resultProc.stderr.on("data", (data) => console.error("Python stderr:", data.toString()));

          resultProc.on("close", async (code) => {
            ongoingGames.delete(userId);

            if (code !== 0)
              return btnInt.followUp({ content: "❌ 勝敗判定中にエラーが発生しました", flags: 64 });

            const [winner, scoreStr] = stdout.trim().split(",").map((s) => s.trim());
            let msg = "";
            let amount = 0;

            const multiplier = Math.min(7, 1 + bet / 16666);

            if (winner === "player") {
              amount = Math.floor(bet * multiplier);
              await client.updateCoins(userId, amount);
              msg = `🎉 勝ち！ +${amount} コイン`;
            } else if (winner === "bot") {
              amount = -Math.floor(bet * multiplier);
              await client.updateCoins(userId, amount);
              msg = `💀 負け！ ${amount} コイン`;
            } else {
              amount = Math.floor(bet / 2);
              await client.updateCoins(userId, amount);
              msg = `🤝 引き分け！ +${amount} コイン返却`;
            }

            let currentCoins = await client.getCoins(userId);
            if (currentCoins < 0) {
              await client.setCoins(userId, 0);
              currentCoins = 0;
            }

            await interaction.editReply({ content: `${msg}\n所持金: ${currentCoins}`, files: [file], components: [] });

            try { fs.unlinkSync(combinedPath); } catch (e) { console.error(e); }
          });
        }

        // --- フォールド ---
        if (btnInt.customId === "fold") {
          collector.stop("folded");
          ongoingGames.delete(userId);

          const refund = Math.floor(bet / 2);
          await client.updateCoins(userId, refund);

          await interaction.editReply({ 
            content: `🏳️ フォールドしました。ベットの半額 ${refund} コインを返却しました。\n所持金: ${await client.getCoins(userId)}`, 
            components: [] 
          });

          try { fs.unlinkSync(combinedPath); } catch {}
          return;
        }
      } catch (err) {
        console.error(err);
        ongoingGames.delete(userId);
        if (!btnInt.replied) await btnInt.followUp({ content: "❌ 予期せぬエラーが発生しました", flags: 64 });
      }
    });

    collector.on("end", async (_, reason) => {
      ongoingGames.delete(userId);
      if (reason !== "called" && reason !== "folded") {
        await client.setCoins(userId, initialCoins);
        await interaction.editReply({ content: `⌛ タイムアウト。ベットを返却しました。\n所持金: ${initialCoins}`, components: [] });
        try { fs.unlinkSync(combinedPath); } catch {}
      }
    });
  });
}
