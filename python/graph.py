#!/usr/bin/env python3
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib as mpl
<<<<<<< HEAD
from datetime import datetime, timedelta
=======
from datetime import datetime, timedelta, timezone
>>>>>>> 45f1ea9083f74c86f60b2aef5e3fc2782dbd172b
import sys
import os
import uuid
import time

# ===================
<<<<<<< HEAD
# ⏱ 計測用
# ===================
T0 = time.time()
def log(msg):
    print(f"[{time.time() - T0:6.2f}s] {msg}", file=sys.stderr)

# ===================
=======
>>>>>>> 45f1ea9083f74c86f60b2aef5e3fc2782dbd172b
# matplotlib 高速化
# ===================
mpl.rcParams.update({
    "path.simplify": True,
    "path.simplify_threshold": 1.0,
    "agg.path.chunksize": 10000,
})

# ===================
<<<<<<< HEAD
# 🚀 超高速 datetime パース（ISO固定前提）
# ===================
def parse_time_fast(t):
    try:
        s = t if isinstance(t, str) else str(t)
        # YYYY-MM-DDTHH:MM:SS まで使用（Z / offset 無視）
        return datetime(
            int(s[0:4]), int(s[5:7]), int(s[8:10]),
            int(s[11:13]), int(s[14:16]), int(s[17:19])
        )
    except Exception:
        return None
=======
# 高速 time パース
# ===================
def parse_time_fast(t):
    if isinstance(t, datetime):
        dt = t
    else:
        s = str(t).strip()
        if s.endswith("Z"):
            s = s[:-1]
        try:
            dt = datetime.fromisoformat(s)
        except ValueError:
            return None

    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt
>>>>>>> 45f1ea9083f74c86f60b2aef5e3fc2782dbd172b

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
<<<<<<< HEAD
# 📉 min/max ダウンサンプル
=======
# min/max ダウンサンプル
>>>>>>> 45f1ea9083f74c86f60b2aef5e3fc2782dbd172b
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

<<<<<<< HEAD
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
=======
        for idx in sorted({min_i, max_i}):
            new_t.append(chunk_t[idx])
            new_p.append(chunk_p[idx])
>>>>>>> 45f1ea9083f74c86f60b2aef5e3fc2782dbd172b

    return new_t, new_p

# ===================
# メイン
# ===================
raw = sys.stdin.read()
log("stdin read done")

if not raw:
    print("❌ no input", file=sys.stderr)
    sys.exit(1)

data = json.loads(raw)
log("json loaded")

history = extract_history(data)
log(f"history extracted: {len(history)}")

fallback_price = float(data.get("stock_price", 1000))

now = datetime.utcnow()
cutoff = now - timedelta(hours=24)

pairs = []
log("start parsing history")

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
    except ValueError:
        continue
<<<<<<< HEAD

    pairs.append((t, p))

log(f"pairs built: {len(pairs)}")

# ソート（時系列保証があるなら削除可）
pairs.sort(key=lambda x: x[0])
log("pairs sorted")

=======

    pairs.append((t, p))

# ソート（元データが時系列なら削除可）
pairs.sort(key=lambda x: x[0])

>>>>>>> 45f1ea9083f74c86f60b2aef5e3fc2782dbd172b
# fallback（最低2点）
if not pairs:
    pairs = [
        (now - timedelta(minutes=10), fallback_price),
        (now, fallback_price),
    ]
elif len(pairs) == 1:
    pairs.insert(0, (pairs[0][0] - timedelta(minutes=10), pairs[0][1]))

<<<<<<< HEAD
# ---- 数値計算（フルデータ）----
=======
# ---- 数値計算はフルデータ ----
>>>>>>> 45f1ea9083f74c86f60b2aef5e3fc2782dbd172b
times_full = [p[0] for p in pairs]
prices_full = [p[1] for p in pairs]

current_price = prices_full[-1]
prev_price = prices_full[-2]
delta = current_price - prev_price
deltaPercent = round(delta / prev_price * 100, 2) if prev_price != 0 else 0.0
min_price = min(prices_full)
max_price = max(prices_full)

# ---- グラフ用だけ削減 ----
times, prices = downsample_minmax(times_full, prices_full, max_points=2000)
<<<<<<< HEAD
log(f"downsampled to {len(times)} points")
=======
>>>>>>> 45f1ea9083f74c86f60b2aef5e3fc2782dbd172b

# ===================
# グラフ描画（見た目そのまま）
# ===================
plt.figure(figsize=(8, 4))
plt.plot(times, prices, linewidth=1.8)
plt.xlabel("time")
plt.ylabel("price")
plt.title("Stock Price (24h)")
plt.grid(True, linestyle="--", alpha=0.6)
plt.gca().set_xticks([])
plt.tight_layout()

output_file = os.path.join(
    os.getcwd(), f"stock_{uuid.uuid1().hex}.png"
)
plt.savefig(output_file)
plt.close()

log("image saved")

print(json.dumps({
    "current": current_price,
    "prev_price": prev_price,
    "delta": delta,
    "deltaPercent": deltaPercent,
    "min": min_price,
    "max": max_price,
    "image": output_file
}))