import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("shizutetsu")
  .setDescription("静鉄の駅を自動的に選出します");

export async function execute(interaction) {
  const arr = ["新静岡","日吉町","音羽町","春日町","柚木","長沼","古庄","県総合運動場","県立美術館前","草薙","御門台","狐ヶ崎","桜橋","入江岡","新清水"];
  const weight = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, ];
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