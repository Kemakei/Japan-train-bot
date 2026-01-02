#!/usr/bin/env python3
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib as mpl
from datetime import datetime, timedelta
import sys
import os
from pathlib import Path

# ===================
# matplotlib 高速化
# ===================
mpl.rcParams.update({
    "path.simplify": True,
    "path.simplify_threshold": 1.0,
    "agg.path.chunksize": 10000,
})

# ===================
# 高速 datetime パース
# ===================
def parse_time_fast(t):
    try:
        s = str(t)
        return datetime(int(s[0:4]), int(s[5:7]), int(s[8:10]),
                        int(s[11:13]), int(s[14:16]), int(s[17:19]))
    except:
        return None

def extract_history(data):
    th = data.get("trade_history")
    if isinstance(th, list):
        return th
    if isinstance(th, dict):
        for v in th.values():
            if isinstance(v, list):
                return v
    return []

# ===================
# min/max ダウンサンプル
# ===================
def downsample_minmax(times, prices, max_points=2000):
    n = len(times)
    if n <= max_points:
        return times, prices

    step = max(1, n // max_points)
    new_t, new_p = [], []
    for i in range(0, n, step):
        chunk_t = times[i:i+step]
        chunk_p = prices[i:i+step]
        if not chunk_p:
            continue
        min_i = chunk_p.index(min(chunk_p))
        max_i = chunk_p.index(max(chunk_p))
        if min_i == max_i:
            new_t.append(chunk_t[min_i])
            new_p.append(chunk_p[min_i])
        else:
            if min_i < max_i:
                new_t.extend([chunk_t[min_i], chunk_t[max_i]])
                new_p.extend([chunk_p[min_i], chunk_p[max_i]])
            else:
                new_t.extend([chunk_t[max_i], chunk_t[min_i]])
                new_p.extend([chunk_p[max_i], chunk_p[min_i]])
    return new_t, new_p

# ===================
# Main
# ===================
raw = sys.stdin.read()
if not raw:
    sys.exit(1)

data = json.loads(raw)
history = extract_history(data)
fallback_price = float(data.get("stock_price", 1000))
now = datetime.utcnow()
cutoff = now - timedelta(hours=24)

pairs = []
for h in history:
    t_raw = h.get("time") or h.get("timestamp") or h.get("date")
    p_raw = h.get("price") or h.get("value") or h.get("close")
    if t_raw is None or p_raw is None:
        continue
    t = parse_time_fast(t_raw)
    if t is None or t < cutoff:
        continue
    try:
        p = float(p_raw)
    except:
        continue
    pairs.append((t, p))

pairs.sort(key=lambda x: x[0])

if not pairs:
    pairs = [(now - timedelta(minutes=10), fallback_price), (now, fallback_price)]
elif len(pairs) == 1:
    pairs.insert(0, (pairs[0][0] - timedelta(minutes=10), pairs[0][1]))

times_full = [p[0] for p in pairs]
prices_full = [p[1] for p in pairs]

current_price = prices_full[-1]
prev_price = prices_full[-2]
delta = current_price - prev_price
deltaPercent = round(delta / prev_price * 100, 2) if prev_price != 0 else 0.0
min_price = min(prices_full)
max_price = max(prices_full)

# ダウンサンプル
times, prices = downsample_minmax(times_full, prices_full, max_points=2000)

# ===================
# グラフ描画
# ===================
plt.figure(figsize=(8,4))
plt.plot(times, prices, linewidth=1.8)
plt.xlabel("time")
plt.ylabel("price")
plt.title("Stock Price (24h)")
plt.grid(True, linestyle="--", alpha=0.6)
plt.gca().set_xticks([])  # X軸ラベルは非表示（必要に応じて変更）
plt.tight_layout()

# Render向けに /tmp 保存
out_dir = Path("/tmp")
out_dir.mkdir(parents=True, exist_ok=True)
output_file = out_dir / f"stock.png"
plt.savefig(output_file)
plt.close()

# 結果出力
print(json.dumps({
    "current": current_price,
    "prev_price": prev_price,
    "delta": delta,
    "deltaPercent": deltaPercent,
    "min": min_price,
    "max": max_price,
    "image": str(output_file)
}))
