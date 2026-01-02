#!/usr/bin/env python3
import sys
import json
import os
from datetime import datetime, timedelta
from concurrent.futures import ProcessPoolExecutor
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# =========================
# 高速設定
# =========================
import matplotlib as mpl
mpl.rcParams.update({
    "path.simplify": True,
    "path.simplify_threshold": 1.0,
    "agg.path.chunksize": 10000,
})

# =========================
# ヘルパー関数
# =========================
def parse_time_fast(t):
    try:
        s = str(t)
        return datetime(int(s[0:4]), int(s[5:7]), int(s[8:10]),
                        int(s[11:13]), int(s[14:16]), int(s[17:19]))
    except:
        return None

def downsample_minmax_np(times, prices, max_points=2000):
    n = len(times)
    if n <= max_points:
        return times, prices
    step = max(1, n // max_points)
    new_t, new_p = [], []
    for i in range(0, n, step):
        chunk_t = times[i:i+step]
        chunk_p = prices[i:i+step]
        chunk_p_np = np.array(chunk_p)
        min_idx = int(np.argmin(chunk_p_np))
        max_idx = int(np.argmax(chunk_p_np))
        if min_idx == max_idx:
            new_t.append(chunk_t[min_idx])
            new_p.append(chunk_p[min_idx])
        else:
            if min_idx < max_idx:
                new_t.extend([chunk_t[min_idx], chunk_t[max_idx]])
                new_p.extend([chunk_p[min_idx], chunk_p[max_idx]])
            else:
                new_t.extend([chunk_t[max_idx], chunk_t[min_idx]])
                new_p.extend([chunk_p[max_idx], chunk_p[min_idx]])
    return new_t, new_p

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
    min_price = np.min(prices_full)
    max_price = np.max(prices_full)

    times, prices = downsample_minmax_np(times_full, prices_full, max_points=2000)

    # =========================
    # グラフ描画（軽量化）
    # =========================
    plt.figure(figsize=(8,4), dpi=80)
    plt.plot(times, prices, linewidth=1.8)
    plt.xlabel("time")
    plt.ylabel("price")
    plt.title("trade")
    plt.grid(True, linestyle="--", alpha=0.6)
    plt.gca().set_xticks([])
    plt.tight_layout()

    out_dir = "/tmp"
    os.makedirs(out_dir, exist_ok=True)
    output_file = os.path.join(out_dir, f"{stock['id']}.png")
    plt.savefig(output_file)
    plt.close()

    return {
        "id": stock["id"],
        "current": current_price,
        "prev_price": prev_price,
        "delta": delta,
        "deltaPercent": deltaPercent,
        "min": float(min_price),
        "max": float(max_price),
        "image": output_file
    }

# =========================
# メイン
# =========================
input_json = sys.stdin.read()
stocks = json.loads(input_json)

with ProcessPoolExecutor(max_workers=min(len(stocks), os.cpu_count())) as executor:
    results = list(executor.map(process_stock, stocks))

print(json.dumps(results))
