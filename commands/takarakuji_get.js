import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("takarakuji_get")
  .setDescription("購入した宝くじの当選結果を確認します");

export async function execute(interaction) {
  const userId = interaction.user.id;
  const { lotteryCol, updateCoins, getCoins } = interaction.client;

  await interaction.deferReply();

  // ユーザーの購入履歴を取得
  const purchasesDoc = await lotteryCol.findOne({ userId });
  const purchases = purchasesDoc?.purchases || [];

  if (purchases.length === 0) {
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

  const winLines = [];
  const remainingPurchases = [];
  let totalPrize = 0;
  let pendingCount = 0;

  for (const t of purchases) {
    const { number, letter, drawId, isWin, prize, rank, claimed } = t;

    if (!drawId) {
      pendingCount++;
      remainingPurchases.push(t);
      continue;
    }

    if (isWin && !claimed) {
      // 当たりのみ追加
      winLines.push(`🎟 ${number}${letter} → 🏆 **${rank}等！** 💰 ${prize.toLocaleString()}コイン獲得！`);
      totalPrize += prize;
      t.claimed = true; // データベース更新用
    } else if (!isWin && !claimed) {
      // 外れは破棄
      continue;
    } else {
      // すでに受け取り済みの当たりは残す
      remainingPurchases.push(t);
    }
  }

  // データベース更新
  await lotteryCol.updateOne(
    { userId },
    { $set: { purchases: remainingPurchases } },
    { upsert: true }
  );

  // コイン加算
  if (totalPrize > 0) await updateCoins(userId, totalPrize);

  // 最新のコイン残高取得
  const coins = await getCoins(userId);

  // Embed作成関数
  const createEmbeds = (lines, title, color = 0xFFD700) => {
    const embeds = [];
    let chunk = "";

    for (const line of lines) {
      // Embed文字数制限を超える場合は分割
      if ((chunk + line + "\n").length > 4000) {
        embeds.push(
          new EmbedBuilder()
            .setTitle(title)
            .setDescription(chunk)
            .setColor(color)
            .setFooter({ text: `残り所持金: ${coins}コイン` })
        );
        chunk = "";
      }
      chunk += line + "\n";
    }

    // 最後のchunkも必ず追加
    if (chunk.length > 0) {
      embeds.push(
        new EmbedBuilder()
          .setTitle(title)
          .setDescription(chunk)
          .setColor(color)
          .setFooter({ text: `残り所持金: ${coins}コイン` })
      );
    }

    return embeds;
  };

  const embeds = [];

  if (winLines.length > 0) embeds.push(...createEmbeds(winLines, "🎉 当選結果"));
  if (pendingCount > 0) {
    embeds.push(
      new EmbedBuilder()
        .setTitle("⏳ 未抽選チケット")
        .setDescription(`現在 **${pendingCount}枚** のチケットはまだ抽選結果が公開されていません。`)
        .setColor(0xAAAAAA)
        .setFooter({ text: `残り所持金: ${coins}コイン` })
    );
  }

  if (embeds.length > 0) {
    // 全てのEmbedを順に送信
    for (const embed of embeds) {
      await interaction.followUp({ embeds: [embed] });
    }
  } else {
    // 当選なし
    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setTitle("📭 当選結果なし")
          .setDescription("当選したチケットはありませんでした。")
          .setColor(0x888888)
          .setFooter({ text: `残り所持金: ${coins}コイン` })
      ]
    });
  }
}
