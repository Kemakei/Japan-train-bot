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

    // 契約選択チェック
    const contract = contracts.find(c => c.daily === amount);
    if (!contract) return interaction.reply({ content: "❌ 無効な契約額です", flags: 64 });

    // 既存契約チェック
    const userHedge = await client.getHedge(userId);
    if (userHedge) return interaction.reply({ content: "❌ 既に契約中です", flags: 64 });

    // コイン残高チェック（契約額の3倍必要）
    const coins = await client.getCoins(userId);
    if (coins < contract.daily * 3) return interaction.reply({ content: `❌ 契約には最低 ${contract.daily * 3} コイン必要です`, flags: 64 });

    // コイン減算（手数料）
    if (coins < contract.fee) return interaction.reply({ content: `❌ 手数料 ${contract.fee} コインが足りません`, flags: 64 });
    await client.updateCoins(userId, -contract.fee);

    // JST基準の日付（YYYY-MM-DD）
    const now = new Date();
    const nowJST = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayStr = nowJST.toISOString().split("T")[0];

    // 契約データ保存
    await client.setHedge(userId, {
      amountPerDay: amount,
      accumulated: 0,
      lastDate: todayStr, // JST基準の日付
    });

    await interaction.reply({
      content: `✅ 契約開始！1日 ${amount} コインずつ保険金がたまります（手数料: ${contract.fee} コイン）`,
      ephemeral: false
    });

  } catch (err) {
    console.error(err);
    await interaction.reply({ content: "❌ 契約処理中にエラーが発生しました", flags: 64 });
  }
}
