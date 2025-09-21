import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} from "discord.js";
import { exec } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- combine.py の絶対パス ---
const pythonPath = path.resolve(__dirname, "../python/combine.py");
const pythonCmd = process.platform === "win32" ? "py" : "python3";

export const data = new SlashCommandBuilder()
  .setName("poker")
  .setDescription("Botと5枚ポーカーで勝負");

export async function execute(interaction) {
  const client = interaction.client;
  const userId = interaction.user.id;

  const bet = 100;
  if (client.getCoins(userId) < bet)
    return interaction.reply({ content: "❌ コインが足りません！", flags: 64 });

  client.updateCoins(userId, -bet);
  await interaction.deferReply();

  // --- デッキ作成 ---
  const suits = ["S","H","D","C"];
  const ranks = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const deck = [];
  for (const r of ranks) for (const s of suits) deck.push(r+s);
  deck.sort(() => Math.random() - 0.5);

  // --- 5枚ずつ配布 ---
  const playerHand = deck.splice(0, 5);
  const botHand = deck.splice(0, 5);

  // --- 画像生成 (Botは裏) ---
  exec(`${pythonCmd} "${pythonPath}" ${playerHand.join(" ")} ${botHand.join(" ")} 0`,
    async (err) => {
    if (err) {
      console.error("Python 実行エラー:", err);
      // ❌ followUp ではなく editReply に変更
      return await interaction.editReply({
        content: "❌ ポーカー画像の生成中にエラーが発生しました",
        components: [] // ボタンを消して押せないようにする
      });
    }

    const combinedPath = path.resolve(__dirname, "../python/images/combined.png");
    const file = new AttachmentBuilder(combinedPath);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("call").setLabel("コール").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("fold").setLabel("フォールド").setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({
      content: `🎲 あなたの手札です。 現在のベット: ${bet}`,
      files: [file],
      components: [row],
    });

    const collector = interaction.channel.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async (btnInt) => {
      if (btnInt.user.id !== userId)
        return btnInt.reply({ content: "❌ あなたのゲームではありません！", flags: 64 });

      try {
        if (btnInt.customId === "call") {
          await btnInt.deferUpdate(); // 先にACK
          collector.stop("called");

          exec(`${pythonCmd} "${pythonPath}" ${playerHand.join(" ")} ${botHand.join(" ")} 1`,
            async (err, stdout) => {
            if (err) {
              console.error("Python 勝敗判定エラー:", err);
              return await interaction.followUp({ content: "❌ 勝敗判定中にエラーが発生しました", flags: 64 });
            }

            const [winner, scoreStr] = stdout.toString().trim().split(",");
            const score = Number(scoreStr);
            const file = new AttachmentBuilder(combinedPath);
            let amount = 0;
            let msg = "";

            if (winner === "player") {
              let multiplier = score <= 200 ? 0.5 : score <= 800 ? 1 : 2;
              amount = Math.floor(bet * multiplier);
              client.updateCoins(userId, amount);
              msg = `🎉 勝ち！ +${amount}\n所持金: ${client.getCoins(userId)}`;
            } else if (winner === "bot") {
              let multiplier = score <= 200 ? 2 : score <= 800 ? 1 : 0.5;
              amount = -Math.floor(bet * multiplier);
              client.updateCoins(userId, amount);
              msg = `💀 負け！ ${amount}\n所持金: ${client.getCoins(userId)}`;
            } else {
              amount = Math.floor(bet / 2);
              client.updateCoins(userId, amount);
              msg = `🤝 引き分け！ ${amount} コイン返却\n所持金: ${client.getCoins(userId)}`;
            }

            await interaction.editReply({ content: msg, files: [file], components: [] });
          });
        }

        if (btnInt.customId === "fold") {
          await btnInt.update({ content: `🏳️ フォールドしました。\n所持金: ${client.getCoins(userId)}`, components: [] });
          collector.stop("folded");
        }
      } catch (err) {
        console.error(err);
        try { await btnInt.deferUpdate(); } catch {}
        await interaction.followUp({ content: "❌ コマンド実行中に予期せぬエラーが発生しました", flags: 64 });
      }
    });

    collector.on("end", async (_, reason) => {
      if (reason !== "called" && reason !== "folded") {
        client.updateCoins(userId, bet);
        await interaction.editReply({ content: `⌛ タイムアウト\n所持金: ${client.getCoins(userId)}`, components: [] });
      }
    });
  });
}
