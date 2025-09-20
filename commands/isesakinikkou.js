import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("isesakinikkou")
  .setDescription("伊勢崎線と日光線の駅を自動的に選出します");

export async function execute(interaction) {
  const arr = [
    "東武動物公園",
    "和戸",
    "久喜",
    "鷲宮",
    "花崎",
    "加須",
    "南羽生",
    "羽生",
    "川俣",
    "茂林寺前",
    "館林",
    "多々良",
    "県",
    "福居",
    "東武和泉",
    "足利市",
    "野州山辺",
    "韮川",
    "太田",
    "細谷",
    "木崎",
    "世良田",
    "境町",
    "剛志",
    "新伊勢崎",
    "伊勢崎",
    "幸手",
    "杉戸高野台",
    "南栗橋",
    "栗橋",
    "新古賀",
    "柳生",
    "板倉東洋大学前",
    "藤岡",
    "静和",
    "新大平下",
    "栃木",
    "新栃木",
    "合戦場",
    "家中",
    "東武金崎",
    "楡木",
    "樅山",
    "新鹿沼",
    "北鹿沼",
    "板荷",
    "下小代",
    "明神",
    "下今市",
    "上今市",
    "東武日光",
  ];
  const weight = [
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  ];
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
