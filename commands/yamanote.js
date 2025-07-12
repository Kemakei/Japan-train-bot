import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("yamanote")
  .setDescription("山手線の駅を自動的に選出します");

export async function execute(interaction) {
  const arr = ["渋谷", "恵比寿", "日暮里", "高田馬場","原宿","新宿","新大久保","目白","池袋","大塚","巣鴨","駒込","田端","西日暮里","鶯谷","上野","御徒町","秋葉原","神田","東京","有楽町"
,"新橋","田町","高輪ゲートウェイ","品川","大崎","五反田","目黒","浜松町","代々木"];
  const weight = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,];
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
