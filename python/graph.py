import sys
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib as mpl
from datetime import datetime, timedelta, UTC
import os

# ---------- matplotlib 高速化 ----------
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
            int(s[11:13]), int(s[14:16]), int(s[17:19]),
            tzinfo=UTC
        )
    except Exception:
        return None

# ---------- min/max ダウンサンプリング ----------
def downsample_minmax(times, prices, max_points=2000):
    n = len(times)
    if n <= max_points:
        return times, prices

    step = max(1, n // max_points)
    nt, np = [], []

    for i in range(0, n, step):
        cp = prices[i:i + step]
        if not cp:
            continue
        ct = times[i:i + step]

        lo = min(range(len(cp)), key=cp.__getitem__)
        hi = max(range(len(cp)), key=cp.__getitem__)

        if lo < hi:
            nt.extend((ct[lo], ct[hi]))
            np.extend((cp[lo], cp[hi]))
        elif hi < lo:
            nt.extend((ct[hi], ct[lo]))
            np.extend((cp[hi], cp[lo]))
        else:
            nt.append(ct[lo])
            np.append(cp[lo])

    return nt, np

# ---------- Figure / Axes 再利用 ----------
fig = plt.figure(figsize=(8, 4))
ax = fig.add_subplot(111)

def setup_axes():
    ax.set_xlabel("time")
    ax.set_ylabel("price")
    ax.set_title("stocks")
    ax.grid(True, linestyle="--", alpha=0.6)
    ax.set_xticks([])

setup_axes()

OUT_DIR = "/tmp"
os.makedirs(OUT_DIR, exist_ok=True)

def process_stock(stock):
    now = datetime.now(UTC)
    cutoff = now - timedelta(hours=24)

    history = stock.get("trade_history", [])
    fallback = float(stock.get("stock_price", 1000))

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
            pairs.append((t, float(p_raw)))
        except Exception:
            pass

    pairs.sort(key=lambda x: x[0])

    if not pairs:
        pairs = [(now - timedelta(minutes=10), fallback), (now, fallback)]
    elif len(pairs) == 1:
        pairs.insert(0, (pairs[0][0] - timedelta(minutes=10), pairs[0][1]))

    times = [p[0] for p in pairs]
    prices = [p[1] for p in pairs]

    times, prices = downsample_minmax(times, prices)

    # ---------- 描画 ----------
    ax.cla()          # ← ここが修正点
    setup_axes()
    ax.plot(times, prices, linewidth=1.8)

    output_file = os.path.join(OUT_DIR, f"{stock['id']}.png")
    fig.savefig(output_file, dpi=60)

    cur = prices[-1]
    prev = prices[-2]

    return {
        "id": stock["id"],
        "current": cur,
        "prev_price": prev,
        "delta": cur - prev,
        "deltaPercent": round((cur - prev) / prev * 100, 2) if prev else 0.0,
        "min": min(prices),
        "max": max(prices),
        "image": output_file
    }

# ---------- main ----------
stocks = json.loads(sys.stdin.read())
results = [process_stock(s) for s in stocks]
print(json.dumps(results))
