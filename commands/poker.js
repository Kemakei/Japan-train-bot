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

export const data = new SlashCommandBuilder()
  .setName("poker")
  .setDescription("Botとポーカーで勝負");

export async function execute(interaction) {
  const client = interaction.client;
  const userId = interaction.user.id;

  let bet = 100;
  if (client.getCoins(userId) < bet) 
    return interaction.reply({ content: "❌ コインが足りません！", flags: 64 });

  client.updateCoins(userId, -bet); // 初期ベット消費
  await interaction.deferReply();

  // デッキ作成
  const suits = ["S", "H", "D", "C"];
  const ranks = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const deck = [];
  for (const r of ranks) for (const s of suits) deck.push(r + s);
  deck.sort(() => Math.random() - 0.5);

  const playerHand = deck.splice(0, 2);
  const botHand = deck.splice(0, 2);

  const pythonPath = path.join(__dirname, "../python/combine.py");
  const pythonCmd = "python3";

  exec(`${pythonCmd} "${pythonPath}" ${playerHand.join(" ")} ${botHand.join(" ")} 0`, async (err) => {
    if (err) return interaction.editReply("❌ エラーが発生しました");

    const combinedPath = path.join(__dirname, "../images/combined.png");
    const file = new AttachmentBuilder(combinedPath);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("bet").setLabel("ベット +100").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("call").setLabel("コール").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("fold").setLabel("フォールド").setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({ content: `あなたの手札です。 現在のベット: ${bet}`, files: [file], components: [row] });

    const collector = interaction.channel.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async (btnInt) => {
      if (btnInt.user.id !== userId)
        return btnInt.reply({ content: "あなたのゲームではありません！", flags: 64 });

      if (btnInt.customId === "bet") {
        if (client.getCoins(userId) < 100 * 1.5) return btnInt.reply({ content: "❌ コインが足りません！", flags: 64 });
        bet += 100;
        client.updateCoins(userId, -100);
        await btnInt.update({ content: `ベットを追加。\n現在のベット: ${bet}`, components: [row] });
      }

      if (btnInt.customId === "call") {
        collector.stop("called");
        exec(`${pythonCmd} "${pythonPath}" ${playerHand.join(" ")} ${botHand.join(" ")} 1`, async (err, stdout) => {
          if (err) return btnInt.update("❌ エラーが発生しました");

          const result = stdout.toString().trim();
          const combinedPath = path.join(__dirname, "../images/combined.png");
          const file = new AttachmentBuilder(combinedPath);

          let msg = "";
          if (result === "player") {
            client.updateCoins(userId, bet * 3);
            msg = `勝ち！ +${bet * 3}\n所持金: ${client.getCoins(userId)}`;
          } else if (result === "bot") {
            client.updateCoins(userId, -(Math.floor(bet * 1.5)));
            msg = `負け！ -${Math.floor(bet * 1.5)}\n所持金: ${client.getCoins(userId)}`;
          } else {
            const refund = Math.floor(bet / 2);
            client.updateCoins(userId, refund);
            msg = `引き分け！ ${refund} コイン返却\n所持金: ${client.getCoins(userId)}`;
          }

          await btnInt.update({ content: msg, files: [file], components: [] });
        });
      }

      if (btnInt.customId === "fold") {
        collector.stop("folded");
        client.updateCoins(userId, -(Math.floor(bet * 1.5)));
        await btnInt.update({ content: `フォールド\n所持金: ${client.getCoins(userId)}`, components: [] });
      }
    });

    collector.on("end", async (_, reason) => {
      if (reason !== "called" && reason !== "folded") {
        client.updateCoins(userId, bet);
        await interaction.editReply({ content: `タイムアウト\n所持金: ${client.getCoins(userId)}`, components: [] });
      }
    });
  });
}
