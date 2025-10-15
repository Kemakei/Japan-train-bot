export async function execute(interaction, { client }) {
  const userId = interaction.user.id;
  const count = Math.min(interaction.options.getInteger("count"), 10000);

  await interaction.deferReply();

  const drawNumber = client.takarakuji.number;
  const drawLetter = client.takarakuji.letter;
  const drawId = getNextDrawId(new Date());

  // --- チケット生成 ---
  const tickets = [];
  for (let i = 0; i < count; i++) {
    const number = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
    const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));

    const { prize, rank } = judgeTicket(number, letter, drawNumber, drawLetter);
    tickets.push({
      userId,
      number,
      letter,
      drawId,
      isWin: prize > 0,
      prize,
      rank,
      claimed: false,
      createdAt: new Date()
    });
  }

  // --- コイン支払い ---
  const costPerTicket = 1000;
  const totalCost = tickets.length * costPerTicket;
  const coins = await client.getCoins(userId);

  if (coins < totalCost) {
    return interaction.editReply({ content: `❌ コイン不足 (${coins}/${totalCost})` });
  }

  await client.updateCoins(userId, -totalCost);

  // --- MongoDBへ保存（500件ずつ） ---
  const batchSize = 1000;
  for (let i = 0; i < tickets.length; i += batchSize) {
    const batch = tickets.slice(i, i + batchSize);
    await client.lotteryTickets.insertMany(batch);
  }

  // --- Embed返信 ---
  const embed = new EmbedBuilder()
    .setTitle("🎟 宝くじ購入完了")
    .setDescription(`購入枚数: ${tickets.length}枚\n支払金額: ${totalCost}コイン`)
    .setColor("Gold")
    .setFooter({ text: `残り所持金: ${coins - totalCost}コイン` });

  await interaction.editReply({ embeds: [embed] });
}
