#!/usr/bin/env python3
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from datetime import datetime, timedelta, timezone
import sys
import os

# --- parse_time と extract_history は既存のまま ---

def parse_time(t):
    if isinstance(t, datetime):
        dt = t
    else:
        s = str(t)
        ss = s.strip()
        if ss.replace('.', '', 1).lstrip('-').isdigit():
            try:
                return datetime.fromtimestamp(float(ss), tz=timezone.utc).astimezone(timezone.utc).replace(tzinfo=None)
            except Exception:
                pass
        s2 = ss.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(s2)
        except Exception:
            patterns = [
                "%Y-%m-%dT%H:%M:%S.%f%z",
                "%Y-%m-%dT%H:%M:%S%z",
                "%Y-%m-%d %H:%M:%S%z",
                "%Y-%m-%dT%H:%M:%S.%f",
                "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%d %H:%M:%S",
            ]
            parsed = None
            for p in patterns:
                try:
                    parsed = datetime.strptime(ss, p)
                    break
                except Exception:
                    continue
            if parsed is None:
                raise ValueError(f"Unrecognized time format: {s!r}")
            dt = parsed
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt

def extract_history(data):
    th = data.get("trade_history", None)
    if th is None:
        if isinstance(data.get("coins"), list):
            return data["coins"]
        return []
    if isinstance(th, dict):
        if isinstance(th.get("coins"), list):
            return th["coins"]
        for v in th.values():
            if isinstance(v, list):
                return v
        return []
    if isinstance(th, list):
        return th
    return []

# --- main ---
input_str = sys.stdin.read()
if not input_str:
    print("❌ データが渡されていません")
    sys.exit(1)

try:
    data = json.loads(input_str)
except json.JSONDecodeError as e:
    print(f"❌ JSON 解析エラー: {e}")
    sys.exit(1)

history = extract_history(data)
if not history:
    history = [{"time": datetime.now(timezone.utc).isoformat(), "price": data.get("stock_price", 950)}]

pairs = []
for idx, h in enumerate(history):
    if not isinstance(h, dict):
        continue
    t_raw = h.get("time") or h.get("timestamp") or h.get("date")
    p_raw = h.get("price") or h.get("value") or h.get("close")
    if t_raw is None or p_raw is None:
        continue
    try:
        t = parse_time(t_raw)
    except Exception:
        continue
    try:
        p = float(p_raw)
    except Exception:
        continue
    pairs.append((t, p))

# 直近24時間に絞る
now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
one_day_ago = now_utc - timedelta(hours=24)
pairs = [pair for pair in pairs if pair[0] >= one_day_ago]
pairs.sort(key=lambda x: x[0])

if not pairs:
    fallback_price = data.get("stock_price") or 950
    try:
        fallback_price = float(fallback_price)
    except Exception:
        fallback_price = 950.0
    pairs = [(now_utc, fallback_price)]

times = [p[0] for p in pairs]
prices = [p[1] for p in pairs]

# --- plot ---
plt.figure(figsize=(8, 4))
plt.plot(times, prices, linestyle='-', linewidth=1.6)
plt.xlabel("time")
plt.ylabel("price")
plt.title("stock price")
plt.gca().set_xticks([])
plt.grid(True, linestyle="--", alpha=0.6)
plt.tight_layout()

# 保存
output_file = os.path.join(os.getcwd(), "stock.png")
plt.savefig(output_file)
plt.close()

# --- 最新・最低・最高株価をJSON出力 ---
current_price = prices[-1]
min_price = min(prices)
max_price = max(prices)

print(json.dumps({
    "current": current_price,
    "min": min_price,
    "max": max_price,
    "image": output_file
}))
