import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("district")
  .setDescription("The bot will choise the station in District Line randomly");

export async function execute(interaction) {
  const arr = [
    "Ealing Broadway",
    "Ealing Common",
    "Acton Town",
    "Chiswick Park",
    "Turnham Green",
    "Stamford Brook",
    "Ravenscourt Park",
    "Hammersmith",
    "Barons Court",
    "Earl's Court",
    "Kensington(Olympia)",
    "Gloucester Road",
    "South Kensington",
    "Sloane Square",
    "Victoria",
    "St. James Park",
    "Westminister",
    "Embankment",
    "Temple",
    "BlackFriars",
    "Mansion House",
    "Cannon Street",
    "Monument",
    "Tower Hill",
    "Aldgate East",
    "Whitechapel",
    "Stepney Green",
    "Mile End",
    "Bow Road",
    "Bromley-by-bow",
    "West Ham",
    "Plaistow",
    "Upton Park",
    "East Ham",
    "Barking",
    "Upney",
    "Becontree",
    "Dagenham Heathway",
    "Dagenham East",
    "Elm Park",
    "Hornchurch",
    "Upminster Bridge",
    "Upminster",
    "Gunnerbury",
    "Kew Gardens",
    "Richmond",
    "West Brompton",
    "Fullhlam Broadway",
    "Parsonls Green",
    "Putneyl Bridge",
    "East Putney",
    "Southfields",
    "Wimbledon Park",
    "Wimbledon",
    "High street Kensington",
    "Notting Hill Gate",
    "Bayswater",
    "Paddington",
    "Edgeware Road",
  ];
  const weight = [
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
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
