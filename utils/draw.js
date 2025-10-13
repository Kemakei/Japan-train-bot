// utils/draw.js
export function getNextDrawId(date = new Date()) {
  const next = new Date(date);
  if (next.getMinutes() < 30) {
    next.setMinutes(30, 0, 0);
  } else {
    next.setHours(next.getHours() + 1, 0, 0, 0);
  }
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  const hh = String(next.getHours()).padStart(2, "0");
  const mm = String(next.getMinutes()).padStart(2, "0");
  return `${y}${m}${d}-${hh}${mm}`;
}
// -------------------- 直近公開済み回の取得 --------------------
export function getLatestDrawId(date = new Date()) {
  const latest = new Date(date);
  if (latest.getMinutes() < 30) {
    latest.setMinutes(0, 0, 0);
  } else {
    latest.setMinutes(30, 0, 0);
  }
  const y = latest.getFullYear();
  const m = String(latest.getMonth() + 1).padStart(2, "0");
  const d = String(latest.getDate()).padStart(2, "0");
  const hh = String(latest.getHours()).padStart(2, "0");
  const mm = String(latest.getMinutes()).padStart(2, "0");
  return `${y}${m}${d}-${hh}${mm}`;
}