#!/usr/bin/env python3
import json
import sys
import os
from datetime import datetime, timedelta
from PIL import Image, ImageDraw

def parse_time_fast(s):
    try:
        return datetime(
            int(s[0:4]), int(s[5:7]), int(s[8:10]),
            int(s[11:13]), int(s[14:16]), int(s[17:19])
        )
    except Exception:
        return None

def downsample(prices, max_points=1500):
    n = len(prices)
    if n <= max_points:
        return prices

    step = max(1, n // max_points)
    out = []
    for i in range(0, n, step):
        out.append(prices[i])
    return out

def draw(prices, out_path):
    W, H = 800, 400
    PAD = 30

    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)

    mn, mx = min(prices), max(prices)
    span = max(mx - mn, 1e-6)

    def tx(i):
        return PAD + i / (len(prices)-1) * (W - PAD*2)

    def ty(p):
        return H - PAD - (p - mn) / span * (H - PAD*2)

    pts = [(tx(i), ty(p)) for i, p in enumerate(prices)]
    d.line(pts, fill=(40, 110, 220), width=2)

    img.save(out_path, format="PNG", optimize=False)

# ============================
# Main
# ============================
raw = sys.stdin.read()
if not raw:
    sys.exit(1)

data = json.loads(raw)
now = datetime.utcnow()
results = []

for stock in data["stocks"]:
    history = stock["history"]
    fallback = float(stock["price"])

    pairs = []

    for h in history:
        t_raw = h.get("time") or h.get("timestamp") or h.get("date")
        p_raw = h.get("price") or h.get("value") or h.get("close")
        if not t_raw or p_raw is None:
            continue

        t = parse_time_fast(t_raw)
        if not t:
            continue

        try:
            p = float(p_raw)
        except:
            continue

        pairs.append((t, p))

    if not pairs:
        pairs = [
            (now - timedelta(minutes=10), fallback),
            (now, fallback),
        ]
    elif len(pairs) == 1:
        pairs.insert(0, (pairs[0][0] - timedelta(minutes=10), pairs[0][1]))

    prices = [p[1] for p in pairs]
    prices = downsample(prices)

    current = prices[-1]
    prev = prices[-2]
    delta = current - prev
    delta_pct = round(delta / prev * 100, 2) if prev != 0 else 0.0

    out = f"/tmp/stock_{stock['id']}.png"
    draw(prices, out)

    results.append({
        "id": stock["id"],
        "current": current,
        "delta": delta,
        "deltaPercent": delta_pct,
        "min": min(prices),
        "max": max(prices),
        "image": out,
    })

print(json.dumps(results))
