import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from "discord.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const data = new SlashCommandBuilder()
  .setName("pokerrule")
  .setDescription("ポーカーゲームのルール説明を表示");

export async function execute(interaction) {
  try {
    // 画像の絶対パス
    const imgPath = path.resolve(__dirname, "../python/images/Pokerrule.jpg");
    const file = new AttachmentBuilder(imgPath);

    const embed = new EmbedBuilder()
      .setTitle("🃏 ポーカーゲームのルール")
      .setColor("Blue")
      .setDescription(
        "このボットでは 5 枚ドローポーカーで対戦できます。\n" +
        "最初に 100 コインをベットしてスタートします。"
      )
      .addFields(
        {
          name: "🎲 ゲームの流れ",
          value:
            "1️⃣ ゲーム開始時にあなたとBotにそれぞれ5枚のカードが配られます。\n" +
            "2️⃣ 画像であなたの手札が表示されます。\n" +
            "3️⃣ **コール / フォールド / ベット増額** ボタンでアクションを選択。\n" +
            "4️⃣ コールすると Bot の手札と勝敗が表示されます。\n\n" +
            "🃏 **トランプの役の強さは下記のとおりです：**"
        },
        {
          name: "💰 ベット",
          value:
            "初期ベットは 100 コインです。\n" +
            "「ベット +100」や「ベット +1000」でさらに賭け金を増やせます。\n" +
            "コールすると勝敗に応じてコインが増減します。"
        },
        {
          name: "⏳ タイムアウト",
          value:
            "60 秒以内に操作しないとタイムアウトとなり、\n" +
            "ベット額は返却されずゲームが終了します。"
        }
      )
      .setImage("attachment://Pokerrule.jpg") // 画像を表示
      .setFooter({ text: "楽しんでプレイしてください！" });

    await interaction.reply({ embeds: [embed], files: [file], ephemeral: false });
  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      await interaction.reply({
        content: "❌ ルール表示中にエラーが発生しました",
        flags: 64
      });
    } else {
      await interaction.editReply({
        content: "❌ ルール表示中にエラーが発生しました"
      });
    }
  }
}
