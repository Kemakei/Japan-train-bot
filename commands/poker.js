import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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

// --- 進行中ゲーム管理 ---
const ongoingGames = new Map(); // userId -> true

export const data = new SlashCommandBuilder()
  .setName("poker")
  .setDescription("Botと5枚ポーカーで勝負");

export async function execute(interaction) {
  const client = interaction.client;
  const userId = interaction.user.id;

  // --- すでに進行中のゲームがある場合は拒否 ---
  if (ongoingGames.has(userId)) {
    return interaction.reply({
      content: "❌ 進行中のゲームがあります。まず終わらせてください！",
      flags: 64,
    });
  }

  // --- ゲーム開始フラグを立てる ---
  ongoingGames.set(userId, true);

  let bet = 100;
  if ((await client.getCoins(userId)) < bet) {
    ongoingGames.delete(userId);
    return interaction.reply({ content: "❌ コインが足りません！", flags: 64 });
  }

  await client.updateCoins(userId, -bet);

  // 所持金がマイナスになったら0に補正
  let currentCoins = await client.getCoins(userId);
  if (currentCoins < 0) {
    await client.setCoins(userId, 0);
    currentCoins = 0;
  }

  await interaction.deferReply();

  // --- デッキ作成 ---
  const suits = ["S", "H", "D", "C"];
  const ranks = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const deck = [];
  for (const r of ranks) for (const s of suits) deck.push(r + s);
  deck.sort(() => Math.random() - 0.5);

  const playerHand = deck.splice(0, 5);
  const botHand = deck.splice(0, 5);

  // --- 出力ファイル名をユーザー+タイムスタンプでユニーク化 ---
  const timestamp = Date.now();
  const combinedPath = path.resolve(__dirname, `../python/images/combined_${userId}_${timestamp}.png`);

  // --- Pythonで画像生成 ---
  const pythonArgs = [pythonPath, ...playerHand, ...botHand, "0", combinedPath];
  const pythonProc = spawn(pythonCmd, pythonArgs);

  pythonProc.on("error", async (err) => {
    console.error("Python 実行エラー:", err);
    ongoingGames.delete(userId);
    await interaction.editReply({
      content: "❌ ポーカー画像の生成中にエラーが発生しました",
      flags: 64
    });
  });

  pythonProc.on("close", async (code) => {
    if (code !== 0) {
      ongoingGames.delete(userId);
      return await interaction.editReply({
        content: "❌ Python スクリプトが異常終了しました",
        flags: 64
      });
    }

    const file = new AttachmentBuilder(combinedPath);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("call").setLabel("コール").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("fold").setLabel("フォールド").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("bet100").setLabel("ベット +100").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("bet1000").setLabel("ベット +1000").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("bet10000").setLabel("ベット +10000").setStyle(ButtonStyle.Primary),
    );

    await interaction.editReply({
      content: `🎲 あなたの手札です。現在のベット: ${bet} コイン`,
      files: [file],
      components: [row],
    });

    // --- ユーザー限定コレクター ---
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
        // --- ベット増加 ---
        if (btnInt.customId === "bet100") {
          if (bet + 100 > (await client.getCoins(userId))) {
            return btnInt.reply({ content: "❌ コインが足りません！", flags: 64 });
          }
          bet += 100;
          await btnInt.update({ content: `🎲 現在のベット: ${bet} コイン`, components: [row] });
          return;
        }

        if (btnInt.customId === "bet1000") {
          if (bet + 1000 > (await client.getCoins(userId))) {
            return btnInt.reply({ content: "❌ コインが足りません！", flags: 64 });
          }
          bet += 1000;
          await btnInt.update({ content: `🎲 現在のベット: ${bet} コイン`, components: [row] });
          return;
        }

        if (btnInt.customId === "bet10000") {
          if (bet + 10000 > (await client.getCoins(userId))) {
            return btnInt.reply({ content: "❌ コインが足りません！", flags: 64 });
          }
          bet += 10000;
          await btnInt.update({ content: `🎲 現在のベット: ${bet} コイン`, components: [row] });
          return;
        }

        // --- コール処理 ---
        if (btnInt.customId === "call") {
          collector.stop("called");
          await btnInt.deferUpdate();

          const pyArgs = [pythonPath, ...playerHand, ...botHand, "1", combinedPath];
          const resultProc = spawn(pythonCmd, pyArgs);

          let stdout = "";
          resultProc.stdout.on("data", (data) => { stdout += data.toString(); });
          resultProc.stderr.on("data", (data) => { console.error("Python stderr:", data.toString()); });

          resultProc.on("close", async (code) => {
            ongoingGames.delete(userId);

            if (code !== 0) {
              return btnInt.followUp({ content: "❌ 勝敗判定中にエラーが発生しました", flags: 64 });
            }

            const [winner, scoreStr] = stdout.trim().split(",").map(s => s.trim());
            const score = Number(scoreStr);
            let amount = 0;
            let msg = "";

            if (winner === "player") {
              let multiplier = score <= 200 ? 0.5 : score <= 800 ? 1 : 2;
              amount = Math.floor(bet * multiplier);
              amount = Math.max(amount, Math.floor(bet * 1.2));
              amount = Math.min(amount, Math.floor(bet * 3));
              await client.updateCoins(userId, amount);

            } else if (winner === "bot") {
              let multiplier = score <= 200 ? 2 : score <= 800 ? 1 : 0.5;
              amount = -Math.floor(bet * multiplier);
              amount = Math.min(amount, -Math.floor(bet * 1));
              amount = Math.max(amount, -Math.floor(bet * 3));
              await client.updateCoins(userId, amount);

            } else {
              amount = Math.floor(bet / 2);
              await client.updateCoins(userId, amount);
            }

            currentCoins = await client.getCoins(userId);
            if (currentCoins < 0) {
              await client.setCoins(userId, 0);
              currentCoins = 0;
            }

            if (winner === "player") msg = `🎉 勝ち！ +${amount} コイン\n所持金: ${currentCoins}`;
            else if (winner === "bot") msg = `💀 負け！ ${amount} コイン\n所持金: ${currentCoins}`;
            else msg = `🤝 引き分け！ ${amount} コイン返却\n所持金: ${currentCoins}`;

            await interaction.editReply({ content: msg, files: [file], components: [] });

            try { fs.unlinkSync(combinedPath); } catch (e) { console.error("一時ファイル削除失敗:", e); }
          });
          return;
        }

        // --- フォールド処理 ---
        if (btnInt.customId === "fold") {
          collector.stop("folded");
          ongoingGames.delete(userId);

          currentCoins = await client.getCoins(userId);
          if (currentCoins < 0) {
            await client.setCoins(userId, 0);
            currentCoins = 0;
          }

          await btnInt.update({
            content: `🏳️ フォールドしました。\n所持金: ${currentCoins}`,
            components: []
          });

          try { fs.unlinkSync(combinedPath); } catch (e) { console.error("一時ファイル削除失敗:", e); }
          return;
        }

      } catch (err) {
        console.error(err);
        ongoingGames.delete(userId);
        if (!btnInt.replied) {
          await btnInt.followUp({ content: "❌ コマンド実行中に予期せぬエラーが発生しました", flags: 64 });
        }
      }
    });

    collector.on("end", async (_, reason) => {
      ongoingGames.delete(userId);
      if (reason !== "called" && reason !== "folded") {
        await client.updateCoins(userId, bet);

        currentCoins = await client.getCoins(userId);
        if (currentCoins < 0) await client.setCoins(userId, 0);

        await interaction.editReply({
          content: `⌛ タイムアウト\n所持金: ${currentCoins}`,
          components: []
        });

        try { fs.unlinkSync(combinedPath); } catch (e) { console.error("一時ファイル削除失敗:", e); }
      }
    });
  });
}
