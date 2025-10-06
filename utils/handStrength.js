// utils/handStrength.js

/**
 * ポーカーハンド強さを判定する簡易関数
 * @param {string[]} cards - 例: ["A♠", "10♥", "10♦", "3♣", "2♠"]
 * @returns {number} 1〜9の整数で強さを表す（1:ハイカード, 9:ストレートフラッシュ）
 */
export function getHandStrength(cards) {
  const ranks = cards.map(c => c.slice(0, -1)); // ["A","10","10","3","2"]
  const suits = cards.map(c => c.slice(-1));   // ["♠","♥","♦","♣"]

  // ランクの出現回数
  const rankCounts = {};
  for (const r of ranks) rankCounts[r] = (rankCounts[r] || 0) + 1;
  const counts = Object.values(rankCounts).sort((a, b) => b - a);

  // フラッシュ判定
  const isFlush = suits.every(s => s === suits[0]);

  // ストレート判定
  const rankValues = ranks.map(r => {
    if (r === "A") return 14;
    if (r === "K") return 13;
    if (r === "Q") return 12;
    if (r === "J") return 11;
    return parseInt(r);
  }).sort((a, b) => a - b);

  const isStraight = rankValues.every((v, i, a) => i === 0 || v === a[i - 1] + 1) 
                     || JSON.stringify(rankValues) === JSON.stringify([2,3,4,5,14]); // A-5ストレート

  // 簡易スコア付与（9が最強）
  if (isFlush && isStraight) return 9;       // ストレートフラッシュ
  if (counts[0] === 4) return 8;             // フォーカード
  if (counts[0] === 3 && counts[1] === 2) return 7; // フルハウス
  if (isFlush) return 6;                     // フラッシュ
  if (isStraight) return 5;                  // ストレート
  if (counts[0] === 3) return 4;             // スリーカード
  if (counts[0] === 2 && counts[1] === 2) return 3; // ツーペア
  if (counts[0] === 2) return 2;             // ワンペア
  return 1;                                  // ハイカード
}
