import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('guess')
  .setDescription('1,2,3の中から数字を選んで勝負！')
  .addIntegerOption(option =>
    option.setName('number')
      .setDescription('1, 2, 3の中から選択')
      .setRequired(true)
      .addChoices(
        { name: '1', value: 1 },
        { name: '2', value: 2 },
        { name: '3', value: 3 }
      )
  )
  .addIntegerOption(option =>
    option.setName('bet')
      .setDescription('賭け金（最低100）')
      .setRequired(true)
  );

export async function execute(interaction) {
  try {
    const userId = interaction.user.id;
    const guess = interaction.options.getInteger('number');
    const bet = interaction.options.getInteger('bet');
    const client = interaction.client;

    let coins = await client.getCoins(userId) || 0;

    // --- 先にチェックして即終了（ephemeral） ---
    if (bet < 100) {
      return await interaction.reply({ content: "❌ 最低掛け金は100です！", flags: 64 });
    }

    if (coins < bet * 1.5) {
      const maxBet = Math.floor(bet * 1.5);
      return await interaction.reply({ content: `❌ 最大 **${maxBet}** コインまで賭けられます！`, flags: 64 });
    }

    // 正常時のみ deferReply（公開メッセージ）
    await interaction.deferReply();

    const answer = Math.floor(Math.random() * 3) + 1;

    const embed = new EmbedBuilder()
      .setTitle("数字予想ゲーム")
      .addFields(
        { name: "選んだ数字", value: `${guess}`, inline: true },
        { name: "正解", value: `${answer}`, inline: true }
      );

    if (guess === answer) {
      const win = Math.ceil(bet * 2.8);
      await client.updateCoins(userId, win);
      coins = await client.getCoins(userId);
      embed.setDescription(`✅ 当たり！ **${win}コイン** 獲得！\n現在のコイン: ${coins}`).setColor("#00FF00");
    } else {
      const loss = Math.ceil(bet * 1.5);
      await client.updateCoins(userId, -loss);
      coins = await client.getCoins(userId);
      embed.setDescription(`外れ… **${loss}コイン** 失いました\n現在のコイン: ${coins}`).setColor("#FF0000");
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error(err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ コマンド実行中にエラーが発生しました。", flags: 64 });
    } else {
      await interaction.editReply({ content: "❌ コマンド実行中にエラーが発生しました。" });
    }
  }
}
