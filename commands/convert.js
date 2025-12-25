import { SlashCommandBuilder } from "discord.js";

const FACTOR = 1_000_000_000_000n; // 1兆

export const data = new SlashCommandBuilder()
  .setName("convert")
  .setDescription("コインと金コインを変換します")
  .addStringOption(option =>
    option
      .setName("direction")
      .setDescription("変換方法を選択")
      .setRequired(true)
      .addChoices(
        { name: "🪙 コイン → 💰 金コイン", value: "to_vip" },
        { name: "💰 金コイン → 🪙 コイン", value: "to_coin" }
      )
  )
  .addStringOption(option =>
    option
      .setName("amount")
      .setDescription("変換したい数（整数）")
      .setRequired(true)
  );

export async function execute(interaction) {
  const userId = interaction.user.id;
  const coinsCol = interaction.client.coinsCol;

  const direction = interaction.options.getString("direction");
  const amountStr = interaction.options.getString("amount");

  let amount;
  try {
    amount = BigInt(amountStr);
  } catch {
    return interaction.reply({ content: "❌ 無効な数字です。整数を入力してください。", flags: 64 });
  }

  if (amount <= 0n) {
    return interaction.reply({ content: "❌ 1以上の数値を指定してください。", flags: 64 });
  }

  // ユーザーの所持データ取得
  const doc = (await coinsCol.findOne({ userId })) || { coins: 0n, VIPCoins: 0n };
  const userCoins = BigInt(doc.coins || 0);
  const userVIP = BigInt(doc.VIPCoins || 0);

  // 双方向変換処理
  if (direction === "to_vip") {
    // 🪙 コイン → 💰 金コイン
    const coinsNeeded = amount * FACTOR;
    if (userCoins < coinsNeeded) {
      return interaction.reply({
        content: `❌ 所持コインが足りません！\n必要: ${coinsNeeded.toLocaleString()} コイン\n所持: ${userCoins.toLocaleString()} コイン`,
        flags: 64
      });
    }

    await coinsCol.updateOne(
      { userId },
      { $inc: { coins: -coinsNeeded, VIPCoins: amount } },
      { upsert: true }
    );

    return interaction.reply({
      content: `✅ ${coinsNeeded.toLocaleString()} コインを ${amount.toLocaleString()} 金コインに変換しました！\n残り: ${(userCoins - coinsNeeded).toLocaleString()} コイン`,
    });

  } else if (direction === "to_coin") {
    // 💰 金コイン → 🪙 コイン
    if (userVIP < amount) {
      return interaction.reply({
        content: `❌ 金コインが足りません！\n必要: ${amount.toLocaleString()} 金コイン\n所持: ${userVIP.toLocaleString()} 金コイン`,
        flags: 64
      });
    }

    const coinsGained = amount * FACTOR;
    await coinsCol.updateOne(
      { userId },
      { $inc: { VIPCoins: -amount, coins: coinsGained } },
      { upsert: true }
    );

    return interaction.reply({
      content: `✅ ${amount.toLocaleString()} 金コインを ${coinsGained.toLocaleString()} コインに変換しました！\n残り: ${(userVIP - amount).toLocaleString()} 金コイン`,
    });

  } else {
    return interaction.reply({ content: "❌ 無効な変換方向です。", flags: 64 });
  }
}
