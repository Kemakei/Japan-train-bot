import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("seibuen")
  .setDescription("西武園線の駅を自動的に選出します");

export async function execute(interaction) {
  const arr = ["東村山", "西武園"];
  const weight = [1, 1];
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
