import { getNextDrawId, getLatestDrawId } from "./draw.js";

async function updateTakarakujiNumber() {
  const now = new Date();
  const minute = now.getMinutes() < 30 ? 0 : 30;
  now.setMinutes(minute, 0, 0);
  const previousDrawId = getLatestDrawId(now);

  try {
    if (client.takarakuji) {
      const { number: oldNumber, letter: oldLetter } = client.takarakuji;

      // 前回分を保存（公開用）
      await db.collection("drawResults").updateOne(
        { drawId: previousDrawId },
        { $set: { number: oldNumber, letter: oldLetter, drawId: previousDrawId, published: true } },
        { upsert: true }
      );
    }

    // 次回分を生成
    const newNumber = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
    const newLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26));

    // client に保持
    client.takarakuji = { number: newNumber, letter: newLetter };

    // 次回分も DB に保存（drawId は buy 側と一致）
    const nextDrawId = getNextDrawId(now);
    await db.collection("drawResults").updateOne(
      { drawId: nextDrawId },
      { $set: { number: newNumber, letter: newLetter, drawId: nextDrawId, published: false } },
      { upsert: true }
    );
  } catch (err) {
    console.error("DB保存失敗:", err);
  }
}

function scheduleTakarakujiUpdate() {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const nextHalfHour =
    minutes < 30
      ? (30 - minutes) * 60 * 1000 - seconds * 1000
      : (60 - minutes) * 60 * 1000 - seconds * 1000;

  setTimeout(async () => {
    await updateTakarakujiNumber();
    setInterval(updateTakarakujiNumber, 30 * 60 * 1000);
  }, nextHalfHour);
}
