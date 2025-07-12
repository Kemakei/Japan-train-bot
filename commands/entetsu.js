import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("entetsu")
  .setDescription("遠州鉄道の駅を自動的に選出します");

export async function execute(interaction) {
  const arr = ["新浜松","第一通り","遠州病院","八幡","助信","曳馬","上島","自動車学校前","さぎの宮","積志","遠州西ヶ崎","遠州小松","浜北","美薗中央公園","遠州小林","遠州芝本","遠州岩水寺","西鹿島"];
  const weight = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,];
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
