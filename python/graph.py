#!/usr/bin/env python3
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from datetime import datetime, timedelta, timezone
import sys
import os
import uuid

# ===============================
# 時刻パース（柔軟対応）
# ===============================
def parse_time(t):
    if isinstance(t, datetime):
        dt = t
    else:
        s = str(t).strip()

        # unix timestamp
        if s.replace('.', '', 1).lstrip('-').isdigit():
            try:
                return datetime.fromtimestamp(
                    float(s), tz=timezone.utc
                ).replace(tzinfo=None)
            except Exception:
                pass

        # ISO8601
        s = s.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(s)
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
                    parsed = datetime.strptime(s, p)
                    break
                except Exception:
                    continue
            if parsed is None:
                raise ValueError(f"Unrecognized time format: {t}")
            dt = parsed

    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


# ===============================
# 履歴抽出（防御的）
# ===============================
def extract_history(data):
    th = data.get("trade_history")

    if isinstance(th, list):
        return th

    if isinstance(th, dict):
        if isinstance(th.get("coins"), list):
            return th["coins"]
        for v in th.values():
            if isinstance(v, list):
                return v

    return []


# ===============================
# メイン処理
# ===============================
raw = sys.stdin.read()
if not raw:
    print("❌ no input")
    sys.exit(1)

try:
    data = json.loads(raw)
except json.JSONDecodeError as e:
    print(f"❌ JSON error: {e}")
    sys.exit(1)

history = extract_history(data)
fallback_price = float(data.get("stock_price", 1000))

pairs = []

for h in history:
    if not isinstance(h, dict):
        continue

    t_raw = h.get("time") or h.get("timestamp") or h.get("date")
    p_raw = h.get("price") or h.get("value") or h.get("close")

    if t_raw is None or p_raw is None:
        continue

    try:
        t = parse_time(t_raw)
        p = float(p_raw)
        pairs.append((t, p))
    except Exception:
        continue

# ===============================
# 直近24時間に限定
# ===============================
now = datetime.now(timezone.utc).replace(tzinfo=None)
cutoff = now - timedelta(hours=24)
pairs = [p for p in pairs if p[0] >= cutoff]
pairs.sort(key=lambda x: x[0])

if not pairs:
    pairs = [(now, fallback_price)]

times = [p[0] for p in pairs]
prices = [p[1] for p in pairs]

# ===============================
# グラフ描画
# ===============================
plt.figure(figsize=(8, 4))
plt.plot(times, prices, linewidth=1.8)
plt.xlabel("time")
plt.ylabel("price")
plt.title("Stock Price (24h)")
plt.grid(True, linestyle="--", alpha=0.6)
plt.gca().set_xticks([])
plt.tight_layout()

# ===============================
# 保存（UUIDで衝突防止）
# ===============================
output_file = os.path.join(
    os.getcwd(),
    f"stock_{uuid.uuid4().hex}.png"
)

plt.savefig(output_file)
plt.close()

# ===============================
# 結果JSON出力
# ===============================
print(json.dumps({
    "current": prices[-1],
    "min": min(prices),
    "max": max(prices),
    "image": output_file
}))