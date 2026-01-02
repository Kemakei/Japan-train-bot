#!/usr/bin/env python3
import json
import sys
import os
import uuid
from datetime import datetime, timedelta
from PIL import Image, ImageDraw

# =====================
# 高速 ISO datetime parse
# =====================
def parse_time_fast(s):
    try:
        return datetime(
            int(s[0:4]), int(s[5:7]), int(s[8:10]),
            int(s[11:13]), int(s[14:16]), int(s[17:19])
        )
    except Exception:
        return None

# =====================
# min/max downsample
# =====================
def downsample_minmax(times, prices, max_points=2000):
    n = len(times)
    if n <= max_points:
        return times, prices

    step = max(1, n // max_points)
    nt, np = [], []

    for i in range(0, n, step):
        ct = times[i:i+step]
        cp = prices[i:i+step]
        if not cp:
            continue

        min_i = max_i = 0
        min_v = max_v = cp[0]

        for j, v in enumerate(cp):
            if v < min_v:
                min_v = v; min_i = j
            elif v > max_v:
                max_v = v; max_i = j

        if min_i == max_i:
            nt.append(ct[min_i])
            np.append(cp[min_i])
        else:
            if min_i < max_i:
                nt += [ct[min_i], ct[max_i]]
                np += [cp[min_i], cp[max_i]]
            else:
                nt += [ct[max_i], ct[min_i]]
                np += [cp[max_i], cp[min_i]]

    return nt, np

# =====================
# グラフ描画（Pillow）
# =====================
def draw_graph(times, prices, out_path):
    W, H = 800, 400
    PAD = 40

    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)

    # grid
    for i in range(5):
        y = PAD + i * (H - PAD*2) / 4
        d.line((PAD, y, W-PAD, y), fill=(220,220,220))
    for i in range(5):
        x = PAD + i * (W - PAD*2) / 4
        d.line((x, PAD, x, H-PAD), fill=(220,220,220))

    min_p = min(prices)
    max_p = max(prices)
    span = max(max_p - min_p, 1e-6)

    def tx(i):
        return PAD + i / (len(prices)-1) * (W - PAD*2)

    def ty(p):
        return H - PAD - (p - min_p) / span * (H - PAD*2)

    pts = [(tx(i), ty(p)) for i, p in enumerate(prices)]
    d.line(pts, fill=(30, 100, 200), width=2)

    img.save(out_path)

# =====================
# メイン
# =====================
raw = sys.stdin.read()
if not raw:
    sys.exit(1)

data = json.loads(raw)
now = datetime.utcnow()
cutoff = now - timedelta(hours=24)

results = []

for stock in data["stocks"]:
    history = stock["history"]
    fallback = float(stock["price"])

    pairs = []

    cutoff_str = cutoff.strftime("%Y-%m-%dT%H:%M:%S")

    for h in history:
        t_raw = h.get("time") or h.get("timestamp") or h.get("date")
        p_raw = h.get("price") or h.get("value") or h.get("close")
        if not t_raw or p_raw is None:
            continue

        if isinstance(t_raw, str) and t_raw[:19] < cutoff_str:
            continue

        t = parse_time_fast(t_raw)
        if not t:
            continue

        try:
            p = float(p_raw)
        except ValueError:
            continue

        pairs.append((t, p))

    if not pairs:
        pairs = [
            (now - timedelta(minutes=10), fallback),
            (now, fallback)
        ]
    elif len(pairs) == 1:
        pairs.insert(0, (pairs[0][0] - timedelta(minutes=10), pairs[0][1]))

    times = [p[0] for p in pairs]
    prices = [p[1] for p in pairs]

    current = prices[-1]
    prev = prices[-2]
    delta = current - prev
    delta_pct = round(delta / prev * 100, 2) if prev != 0 else 0.0

    min_p = min(prices)
    max_p = max(prices)

    times, prices = downsample_minmax(times, prices)

    out = os.path.join(os.getcwd(), f"stock_{uuid.uuid4().hex}.png")
    draw_graph(times, prices, out)

    results.append({
        "id": stock["id"],
        "current": current,
        "prev": prev,
        "delta": delta,
        "deltaPercent": delta_pct,
        "min": min_p,
        "max": max_p,
        "image": out
    })

print(json.dumps(results))
