#!/usr/bin/env python3
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from datetime import datetime, timedelta, timezone
import sys
import os
import uuid

# ===================
# 高速な time パース
# ===================
def parse_time_fast(t):
    if isinstance(t, datetime):
        dt = t
    else:
        s = str(t).strip()
        # Z を高速に処理
        if s.endswith("Z"):
            s = s[:-1]
        try:
            dt = datetime.fromisoformat(s)
        except ValueError:
            return None

    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt

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
# メイン
# ===================
raw = sys.stdin.read()
if not raw:
    print("❌ no input", file=sys.stderr)
    sys.exit(1)

try:
    data = json.loads(raw)
except Exception as e:
    print(f"❌ JSON error: {e}", file=sys.stderr)
    sys.exit(1)

history = extract_history(data)
fallback_price = float(data.get("stock_price", 1000))

now = datetime.utcnow()
cutoff = now - timedelta(hours=24)

pairs = []
for h in history:
    # get 回数を最小化
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

    pairs.append((t, p))

pairs.sort(key=lambda x: x[0])

# fallback（最低2点）
if not pairs:
    pairs = [
        (now - timedelta(minutes=10), fallback_price),
        (now, fallback_price),
    ]
elif len(pairs) == 1:
    pairs.insert(0, (pairs[0][0] - timedelta(minutes=10), pairs[0][1]))

times = [p[0] for p in pairs]
prices = [p[1] for p in pairs]

current_price = prices[-1]
prev_price = prices[-2]
delta = current_price - prev_price
deltaPercent = round(delta / prev_price * 100, 2) if prev_price != 0 else 0.0

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
    os.getcwd(), f"stock_{uuid.uuid4().hex}.png"
)
plt.savefig(output_file)
plt.close()

print(json.dumps({
    "current": current_price,
    "prev_price": prev_price,
    "delta": delta,
    "deltaPercent": deltaPercent,
    "min": min(prices),
    "max": max(prices),
    "image": output_file
}))