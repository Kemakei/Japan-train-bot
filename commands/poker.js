import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} from "discord.js";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pythonPath = path.resolve(__dirname, "../python/combine.py");
const pythonCmd = process.platform === "win32" ? "py" : "python3";

export const data = new SlashCommandBuilder()
  .setName("poker")
  .setDescription("Botと5枚ポーカーで勝負");

export async function execute(interaction) {
  const client = interaction.client;
  const userId = interaction.user.id;

  let bet = 100;
  if (client.getCoins(userId) < bet) {
    return interaction.reply({ content: "❌ コインが足りません！", flags: 64 });
  }

  client.updateCoins(userId, -bet);
  await interaction.deferReply();

  // --- デッキ作成 ---
  const suits = ["S", "H", "D", "C"];
  const ranks = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const deck = [];
  for (const r of ranks) for (const s of suits) deck.push(r + s);
  deck.sort(() => Math.random() - 0.5);

  const playerHand = deck.splice(0, 5);
  const botHand = deck.splice(0, 5);

  // --- Pythonで画像生成 ---
  const pythonArgs = [pythonPath, ...playerHand, ...botHand, "0"];
  const pythonProc = spawn(pythonCmd, pythonArgs);

  pythonProc.on("error", async (err) => {
    console.error("Python 実行エラー:", err);
    await interaction.editReply({
      content: "❌ ポーカー画像の生成中にエラーが発生しました",
      components: []
    });
  });

  pythonProc.on("close", async (code) => {
    if (code !== 0) {
      return await interaction.editReply({
        content: "❌ Python スクリプトが異常終了しました",
        components: []
      });
    }

    const combinedPath = path.resolve(__dirname, "../python/images/combined.png");
    const file = new AttachmentBuilder(combinedPath);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("call").setLabel("コール").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("fold").setLabel("フォールド").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("bet100").setLabel("ベット +100").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("bet1000").setLabel("ベット +1000").setStyle(ButtonStyle.Primary),
    );

    await interaction.editReply({
      content: `🎲 あなたの手札です。現在のベット: ${bet} コイン`,
      files: [file],
      components: [row],
    });

    const collector = interaction.channel.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async (btnInt) => {
      if (btnInt.user.id !== userId) {
        return btnInt.reply({ content: "❌ あなたのゲームではありません！", flags: 64 });
      }

      try {
        // ボタンIDごとの処理
        if (btnInt.customId === "bet100") {
          if ((bet + 100) * 2 > client.getCoins(userId)) {
            // deferUpdateしていないので reply でOK
            return btnInt.reply({ content: "❌ コインが足りません！", flags: 64 });
          }
          bet += 100;
          await btnInt.update({ content: `🎲 現在のベット: ${bet} コイン`, components: [row] });
          return;
        }

        if (btnInt.customId === "bet1000") {
          if ((bet + 1000) * 2 > client.getCoins(userId)) {
            return btnInt.reply({ content: "❌ コインが足りません！", flags: 64 });
          }
          bet += 1000;
          await btnInt.update({ content: `🎲 現在のベット: ${bet} コイン`, components: [row] });
          return;
        }

        if (btnInt.customId === "call") {
          collector.stop("called");

          // deferUpdateしてから勝敗判定
          await btnInt.deferUpdate();

          const pyArgs = [pythonPath, ...playerHand, ...botHand, "1"];
          const resultProc = spawn(pythonCmd, pyArgs);

          let stdout = "";
          resultProc.stdout.on("data", (data) => { stdout += data.toString(); });
          resultProc.stderr.on("data", (data) => { console.error("Python stderr:", data.toString()); });

          resultProc.on("close", async (code) => {
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
              client.updateCoins(userId, amount);
              msg = `🎉 勝ち！ +${amount} コイン\n所持金: ${client.getCoins(userId)}`;
            } else if (winner === "bot") {
              let multiplier = score <= 200 ? 2 : score <= 800 ? 1 : 0.5;
              amount = -Math.floor(bet * multiplier);
              client.updateCoins(userId, amount);
              msg = `💀 負け！ ${amount} コイン\n所持金: ${client.getCoins(userId)}`;
            } else {
              amount = Math.floor(bet / 2);
              client.updateCoins(userId, amount);
              msg = `🤝 引き分け！ ${amount} コイン返却\n所持金: ${client.getCoins(userId)}`;
            }

            await interaction.editReply({ content: msg, files: [file], components: [] });
          });
          return;
        }

        if (btnInt.customId === "fold") {
          collector.stop("folded");
          await btnInt.update({
            content: `🏳️ フォールドしました。\n所持金: ${client.getCoins(userId)}`,
            components: []
          });
          return;
        }

      } catch (err) {
        console.error(err);
        if (!btnInt.replied) {
          await btnInt.followUp({ content: "❌ コマンド実行中に予期せぬエラーが発生しました", flags: 64 });
        }
      }
    });

    collector.on("end", async (_, reason) => {
      if (reason !== "called" && reason !== "folded") {
        client.updateCoins(userId, bet);
        await interaction.editReply({
          content: `⌛ タイムアウト\n所持金: ${client.getCoins(userId)}`,
          components: []
        });
      }
    });
  });
}
