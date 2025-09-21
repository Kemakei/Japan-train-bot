import { SlashCommandBuilder } from "discord.js";

const contracts = [
  { daily: 100, fee: 50 },
  { daily: 300, fee: 150 },
  { daily: 500, fee: 250 },
  { daily: 1000, fee: 500 },
  { daily: 5000, fee: 1000 },
  { daily: 10000, fee: 1500 },
];

export const data = new SlashCommandBuilder()
  .setName("hedge_contract")
  .setDescription("保険金契約を開始します")
  .addIntegerOption(opt =>
    opt.setName("amount")
      .setDescription("1日あたりの契約額")
      .setRequired(true)
      .addChoices(...contracts.map(c => ({ name: `${c.daily}`, value: c.daily })))
  );

export async function execute(interaction) {
  try {
    const userId = interaction.user.id;
    const client = interaction.client;
    const amount = interaction.options.getInteger("amount");

    const contract = contracts.find(c => c.daily === amount);
    if (!contract) return interaction.reply({ content: "❌ 無効な契約額です", ephemeral: true });

    const coins = client.getCoins(userId) || 0;
    const initialCost = contract.fee;

    if (coins < initialCost) return interaction.reply({ content: "❌ コインが足りません", ephemeral: true });

    const userHedge = client.getHedge(userId);
    if (userHedge) return interaction.reply({ content: "❌ 既に契約中です", ephemeral: true });

    client.updateCoins(userId, -initialCost);

    const now = new Date();
    const jstOffset = 9 * 60; // JST +9時間
    const nowJST = new Date(now.getTime() + jstOffset * 60 * 1000);

    client.setHedge(userId, {
      amountPerDay: amount,
      accumulated: 0,
      lastUpdateJST: nowJST.getTime(),
    });

    await interaction.reply({
      content: `✅ 契約開始！1日 ${amount} コインずつ保険金がたまります（手数料: ${contract.fee} コイン）`,
      ephemeral: false
    });

  } catch (err) {
    console.error(err);
    await interaction.reply({ content: "❌ 契約処理中にエラーが発生しました", ephemeral: true });
  }
}
