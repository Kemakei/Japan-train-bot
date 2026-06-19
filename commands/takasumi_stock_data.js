import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("takasumi_stock_data")
  .setDescription("[takasumi bot用]株価データを解析します")
  .addStringOption(option =>
    option
      .setName("stock")
      .setDescription("会社名または銘柄ID")
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function handleAutocomplete(interaction) {
  try {
    const focused = interaction.options.getFocused().toLowerCase();

    const response = await fetch(process.env.STOCK_API_URL);
    if (!response.ok) return interaction.respond([]);

    const stocks = await response.json();

    const choices = stocks
      .filter(stock =>
        stock.name?.toLowerCase().includes(focused) ||
        stock.id?.toLowerCase().includes(focused)
      )
      .slice(0, 25)
      .map(stock => ({
        name: `${stock.name} (${stock.id})`,
        value: stock.id
      }));

    await interaction.respond(choices);
  } catch (err) {
    console.error("stockdata autocomplete error:", err);
    try {
      await interaction.respond([]);
    } catch {}
  }
}

export async function execute(interaction) {
  await interaction.deferReply();

  const companyInput = interaction.options.getString("company");

  try {
  async function fetchCompanyData(companyId) {
  let res;

  try {
    res = await request(
      `https://api.takasumibot.com/v3/company/history/${companyId}`
    );
  } catch {
    throw new Error("API取得に失敗しました");
  }

  if (res.statusCode !== 200) {
    throw new Error("APIエラーが発生しました");
  }

  let data;

  try {
    data = JSON.parse(await res.body.text());
  } catch {
    throw new Error("JSON解析に失敗しました");
  }

  return Array.isArray(data) ? data : [];
}

    const stocks = await response.json();

    const stock = stocks.find(s =>
      s.id?.toLowerCase() === companyInput.toLowerCase() ||
      s.name?.toLowerCase() === companyInput.toLowerCase()
    );

    if (!stock) {
      return interaction.editReply("❌ 該当する会社が見つかりません");
    }

    if (!Array.isArray(stock.prices) || stock.prices.length < 5) {
      return interaction.editReply("❌ 株価データが不足しています");
    }

    const prices = stock.prices.slice(-100);

    const latest = prices.at(-1);
    const previous = prices.at(-2);

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    const shortPrices = prices.slice(-20);

    const shortMA =
      shortPrices.reduce((a, b) => a + b, 0) /
      shortPrices.length;

    const longMA =
      prices.reduce((a, b) => a + b, 0) /
      prices.length;

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    prices.forEach((price, i) => {
      sumX += i;
      sumY += price;
      sumXY += i * price;
      sumXX += i * i;
    });

    const n = prices.length;

    const slope =
      (n * sumXY - sumX * sumY) /
      (n * sumXX - sumX * sumX);

    const previousRate =
      ((latest - previous) / previous) * 100;

    const rate10 =
      prices.length >= 10
        ? ((latest - prices[prices.length - 10]) /
            prices[prices.length - 10]) *
          100
        : 0;

    const rate30 =
      prices.length >= 30
        ? ((latest - prices[prices.length - 30]) /
            prices[prices.length - 30]) *
          100
        : 0;

    const mean =
      prices.reduce((a, b) => a + b, 0) /
      prices.length;

    const variance =
      prices.reduce(
        (sum, value) =>
          sum + Math.pow(value - mean, 2),
        0
      ) / prices.length;

    const volatility = Math.sqrt(variance);

    let streak = 0;

    for (let i = prices.length - 1; i > 0; i--) {
      if (prices[i] > prices[i - 1]) streak++;
      else break;
    }

    let prediction =
      latest +
      slope +
      latest * (rate10 / 100) * 0.15 +
      latest * (rate30 / 100) * 0.1;

    prediction = Math.round(prediction);

    let trend = "横ばい";

    if (shortMA > longMA * 1.01) trend = "上昇傾向";
    if (shortMA < longMA * 0.99) trend = "下降傾向";

    let confidence = 50;

    if (Math.abs(rate10) < 5) confidence += 10;
    if (Math.abs(rate30) < 10) confidence += 10;
    if (volatility < mean * 0.05) confidence += 15;
    if (streak >= 3) confidence += 10;
    if (Math.abs(slope) < mean * 0.02) confidence += 10;

    confidence = Math.min(confidence, 95);

    const dividendAmount =
      stock.dividendAmount ?? 0;

    const dividendRate =
      ((stock.dividendRate ?? 0) * 100).toFixed(4);

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${stock.name}`)
      .setDescription(stock.description || "説明なし")
      .addFields(
        {
          name: "銘柄ID",
          value: stock.id,
          inline: true
        },
        {
          name: "現在値",
          value: latest.toLocaleString(),
          inline: true
        },
        {
          name: "前回比",
          value: `${previousRate.toFixed(2)}%`,
          inline: true
        },
        {
          name: "最高値",
          value: maxPrice.toLocaleString(),
          inline: true
        },
        {
          name: "最低値",
          value: minPrice.toLocaleString(),
          inline: true
        },
        {
          name: "傾向",
          value: trend,
          inline: true
        },
        {
          name: "10件変動率",
          value: `${rate10.toFixed(2)}%`,
          inline: true
        },
        {
          name: "30件変動率",
          value: `${rate30.toFixed(2)}%`,
          inline: true
        },
        {
          name: "上昇継続",
          value: `${streak}回`,
          inline: true
        },
        {
          name: "ボラティリティ",
          value: volatility.toFixed(2),
          inline: true
        },
        {
          name: "予測次回値",
          value: prediction.toLocaleString(),
          inline: true
        },
        {
          name: "予測信頼度",
          value: `${confidence}%`,
          inline: true
        },
        {
          name: "配当金",
          value: dividendAmount.toLocaleString(),
          inline: true
        },
        {
          name: "配当率",
          value: `${dividendRate}%`,
          inline: true
        }
      )
      .setFooter({
        text: `解析対象: 最新${prices.length}件`
      })
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed]
    });

  } catch (err) {
    console.error(err);

    await interaction.editReply(
      "❌ 株価解析中にエラーが発生しました"
    );
  }
}
