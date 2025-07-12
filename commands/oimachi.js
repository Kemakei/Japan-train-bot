import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("oimachi")
  .setDescription("大井町線の駅を自動的に選出します");

export async function execute(interaction) {
  const arr = ["溝の口","二子玉川","上野毛","等々力","尾山台","九品仏","自由が丘","大岡山","北千束","旗の台","荏原町","中延","戸越公園","下新明","大井町"];
  const weight = [1, 1,];
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