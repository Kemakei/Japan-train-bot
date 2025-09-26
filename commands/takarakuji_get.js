import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("takarakuji_get")
  .setDescription("購入した宝くじの結果を確認します");

export async function execute(interaction) {
  const userId = interaction.user.id;
  const { lotteryCol, db, updateCoins } = interaction.client;

  // deferReply → 公開にする（followUpでエフェメラルを分けるため）
  await interaction.deferReply();

  // 購入履歴取得
  const purchasesDoc = await lotteryCol.findOne({ userId });
  const purchases = purchasesDoc?.purchases || [];

  if (purchases.length === 0) {
    // 購入履歴なし（エフェメラル）
    return interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ 購入履歴なし")
          .setDescription("現在、あなたの購入履歴はありません。")
          .setColor(0xFF0000)
      ],
      flags: 64
    });
  }

  const drawResultsCol = db.collection("drawResults");
  const publicLines = [];    // 公開用（当選・ハズレ）
  const ephemeralLines = []; // エフェメラル用（抽選前）
  const remainingPurchases = [];

  for (const purchase of purchases) {
    const { number, letter, drawId } = purchase;
    const result = await drawResultsCol.findOne({ drawId });

    if (!result) {
      // 抽選前 → エフェメラル行き
      ephemeralLines.push(`🎟 ${number}${letter} → ⏳ まだ抽選結果は出ていません`);
      remainingPurchases.push(purchase);
      continue;
    }

    // 抽選済み → DBから削除
    await lotteryCol.updateOne(
      { userId },
      { $pull: { purchases: { drawId } } }
    );

    const { number: drawNumber, letter: drawLetter } = result;
    let line;
    let prizeAmount = 0;

    if (number === drawNumber && letter === drawLetter) {
      prizeAmount = 1000000;
      line = `🎟 ${number}${letter} → 🏆 1等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number === drawNumber) {
      prizeAmount = 750000;
      line = `🎟 ${number}${letter} → 🏆 2等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number.slice(1) === drawNumber.slice(1) && letter === drawLetter) {
      prizeAmount = 500000;
      line = `🎟 ${number}${letter} → 🏆 3等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number.slice(2) === drawNumber.slice(2)) {
      prizeAmount = 300000;
      line = `🎟 ${number}${letter} → 🏆 4等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number.slice(3) === drawNumber.slice(3) && letter === drawLetter) {
      prizeAmount = 100000;
      line = `🎟 ${number}${letter} → 🏆 5等！💰 ${prizeAmount}コイン獲得！`;
    } else if (letter === drawLetter) {
      prizeAmount = 10000;
      line = `🎟 ${number}${letter} → 🏆 6等！💰 ${prizeAmount}コイン獲得！`;
    } else if (number.slice(4) === drawNumber.slice(4)) {
      prizeAmount = 5000;
      line = `🎟 ${number}${letter} → 🏆 7等！💰 ${prizeAmount}コイン獲得！`;
    } else {
      line = `🎟 ${number}${letter} → ❌ 残念、ハズレ…`;
    }

    if (prizeAmount > 0) {
      await updateCoins(userId, prizeAmount);
    }

    publicLines.push(line);
  }

  // 抽選前の購入だけ再保存
  await lotteryCol.updateOne(
    { userId },
    { $set: { purchases: remainingPurchases } },
    { upsert: true }
  );

  // Embed分割関数（4000文字ごとに分割、続き番号は 1 始まり）
  function createEmbedsFromText(text, title, color = 0x00AE86) {
    const embeds = [];
    const chunks = text.match(/[\s\S]{1,4000}/g) || [];
    for (let i = 0; i < chunks.length; i++) {
      embeds.push(
        new EmbedBuilder()
          .setTitle(i === 0 ? title : `${title} (続き${i + 1})`)
          .setDescription(chunks[i])
          .setColor(color)
      );
    }
    return embeds;
  }

  // 公開メッセージ（当選・ハズレ）
  if (publicLines.length > 0) {
    const publicEmbeds = createEmbedsFromText(publicLines.join("\n"), "🎉 抽選結果");
    // Embedが10個以上なら分割して送信
    for (let i = 0; i < publicEmbeds.length; i += 10) {
      await interaction.followUp({ embeds: publicEmbeds.slice(i, i + 10), flags: 0 });
    }
  }

  // エフェメラルメッセージ（抽選前）
  if (ephemeralLines.length > 0) {
    const ephemeralEmbeds = createEmbedsFromText(ephemeralLines.join("\n"), "⏳ 未公開の抽選", 0xAAAAAA);
    for (let i = 0; i < ephemeralEmbeds.length; i += 10) {
      await interaction.followUp({ embeds: ephemeralEmbeds.slice(i, i + 10), flags: 64 });
    }
  }
}
