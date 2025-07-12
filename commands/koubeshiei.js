import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("koubeshiei")
  .setDescription("神戸市営地下鉄の駅を自動的に選出します");

export async function execute(interaction) {
  const arr = ["西神中央", "西神南","伊川谷","学園都市","総合運動公園","名谷","妙法寺","板宿","新長田","長田（長田神社前）","上沢","湊川公園","大倉山","県庁前","三宮","新神戸","谷上","駒ヶ林","苅藻","御崎公園","和田岬","中央市場前","バーバーランド","みなと元町","旧居留地・大丸前","三宮・花時計前"];
  const weight = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  let result = "";

  let totalWeight = 0;
  for (let i = 0; i < weight.length; i++) {
    totalWeight += weight[i];
  }
  let random = Math.floor(Math.random() * totalWeight);

  for (let i = 0; i < weight.length; i++) {
    if (random < weight[i]) {
      result = arr[i];
      break;
    } else {
      random -= weight[i];
    }
  }

  await interaction.reply(`${result} `);
}
