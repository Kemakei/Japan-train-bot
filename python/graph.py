import sys
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib as mpl
from datetime import datetime, timedelta
import os

# matplotlib 高速化（見た目影響なし）
mpl.rcParams.update({
    "path.simplify": True,
    "path.simplify_threshold": 1.0,
    "agg.path.chunksize": 10000,
})

# ---------- 高速時間パース ----------
def parse_time_fast(t):
    try:
        s = str(t)
        return datetime(
            int(s[0:4]), int(s[5:7]), int(s[8:10]),
            int(s[11:13]), int(s[14:16]), int(s[17:19])
        )
    except Exception:
        return None

# ---------- min/max ダウンサンプリング（見た目同一） ----------
def downsample_minmax(times, prices, max_points=2000):
    n = len(times)
    if n <= max_points:
        return times, prices

    step = max(1, n // max_points)
    new_t, new_p = [], []

    for i in range(0, n, step):
        chunk_t = times[i:i + step]
        chunk_p = prices[i:i + step]
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

# ---------- Figure / Axes を再利用（重要） ----------
FIG_SIZE = (8, 4)

fig = plt.figure(figsize=FIG_SIZE)
ax = fig.add_subplot(111)

def process_stock(stock):
    now = datetime.utcnow()
    cutoff = now - timedelta(hours=24)

    history = stock.get("trade_history", [])
    fallback_price = float(stock.get("stock_price", 1000))

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
        except Exception:
            continue

        pairs.append((t, p))

    pairs.sort(key=lambda x: x[0])

    if not pairs:
        pairs = [
            (now - timedelta(minutes=10), fallback_price),
            (now, fallback_price)
        ]
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

    times, prices = downsample_minmax(times_full, prices_full)

    # ---------- 描画（見た目完全維持） ----------
    ax.clear()
    ax.plot(times, prices, linewidth=1.8)
    ax.set_xlabel("time")
    ax.set_ylabel("price")
    ax.set_title("stocks")
    ax.grid(True, linestyle="--", alpha=0.6)
    ax.set_xticks([])

    fig.tight_layout()

    out_dir = "/tmp"
    os.makedirs(out_dir, exist_ok=True)
    output_file = os.path.join(out_dir, f"{stock['id']}.png")

    fig.savefig(output_file)
    # close はしない（再利用）

    return {
        "id": stock["id"],
        "current": current_price,
        "prev_price": prev_price,
        "delta": delta,
        "deltaPercent": deltaPercent,
        "min": min_price,
        "max": max_price,
        "image": output_file
    }

# ===== メイン =====
input_json = sys.stdin.read()
stocks = json.loads(input_json)

# Render では並列化しない（最重要）
results = [process_stock(stock) for stock in stocks]

print(json.dumps(results))
