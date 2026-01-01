#!/usr/bin/env python3
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from datetime import datetime, timedelta, timezone
import sys
import os
import uuid

def parse_time(t):
    if isinstance(t, datetime):
        dt = t
    else:
        s = str(t).strip()
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except Exception:
            dt = datetime.utcnow()
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

pairs = []
for h in history:
    t_raw = h.get("time") or h.get("timestamp") or h.get("date")
    p_raw = h.get("price") or h.get("value") or h.get("close")
    if t_raw is None or p_raw is None:
        continue
    try:
        t = parse_time(t_raw)
        p = float(p_raw)
        pairs.append((t, p))
    except:
        continue

now = datetime.now(timezone.utc).replace(tzinfo=None)
cutoff = now - timedelta(hours=24)
pairs = [p for p in pairs if p[0] >= cutoff]
pairs.sort(key=lambda x: x[0])

# fallback 1点だけの場合は最低2点にする
if len(pairs) == 0:
    pairs = [(now - timedelta(minutes=10), fallback_price), (now, fallback_price)]
elif len(pairs) == 1:
    pairs.insert(0, (pairs[0][0] - timedelta(minutes=10), pairs[0][1]))

times = [p[0] for p in pairs]
prices = [p[1] for p in pairs]

current_price = prices[-1]
prev_price = prices[-2] if len(prices) > 1 else prices[-1]
delta = current_price - prev_price
deltaPercent = round(delta / prev_price * 100, 2) if prev_price != 0 else 0.0

# ===================
# グラフ描画
# ===================
plt.figure(figsize=(8, 4))
plt.plot(times, prices, linewidth=1.8)
plt.xlabel("time")
plt.ylabel("price")
plt.title("Stock Price (24h)")
plt.grid(True, linestyle="--", alpha=0.6)
plt.gca().set_xticks([])
plt.tight_layout()

output_file = os.path.join(os.getcwd(), f"stock_{uuid.uuid4().hex}.png")
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
