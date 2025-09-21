#!/usr/bin/env python3
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from datetime import datetime, timedelta, timezone
import sys
import os

matplotlib.rcParams['font.family'] = 'IPAexGothic'  # 日本語フォント

def parse_time(t):
    """柔軟に時刻文字列をパースし、UTC Naive datetime を返す（例: '...Z' を扱う）"""
    if isinstance(t, datetime):
        dt = t
    else:
        s = str(t)
        # Unix epoch 秒・ミリ秒の数字形式を許容
        ss = s.strip()
        if ss.replace('.', '', 1).lstrip('-').isdigit():
            # 整数は秒、少数は秒に見なす
            try:
                return datetime.fromtimestamp(float(ss), tz=timezone.utc).astimezone(timezone.utc).replace(tzinfo=None)
            except Exception:
                pass
        # Z を +00:00 に置換して fromisoformat へ
        s2 = ss.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(s2)
        except Exception:
            # 追加のフォーマットにフォールバック
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
                    parsed = datetime.strptime(ss, p)
                    break
                except Exception:
                    continue
            if parsed is None:
                raise ValueError(f"Unrecognized time format: {s!r}")
            dt = parsed
    # dt を UTC に寄せて tzinfo を外す（naive UTC）
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt

def extract_history(data):
    """data 内の trade_history を色々な形から抽出して list を返す"""
    th = data.get("trade_history", None)
    if th is None:
        # 直接 coins がある可能性
        if isinstance(data.get("coins"), list):
            return data["coins"]
        return []
    # trade_history が dict なら中の coins を探す
    if isinstance(th, dict):
        if isinstance(th.get("coins"), list):
            return th["coins"]
        # 他に list が入っていればそれを使う
        for v in th.values():
            if isinstance(v, list):
                return v
        return []
    # そのまま list の場合
    if isinstance(th, list):
        return th
    return []

# --- main ---
input_str = sys.stdin.read()
if not input_str:
    print("❌ データが渡されていません")
    sys.exit(1)

try:
    data = json.loads(input_str)
except json.JSONDecodeError as e:
    print(f"❌ JSON 解析エラー: {e}")
    sys.exit(1)

history = extract_history(data)
# 空なら fallback
if not history:
    history = [{"time": datetime.now(timezone.utc).isoformat(), "price": data.get("stock_price", 950)}]

pairs = []
for idx, h in enumerate(history):
    if not isinstance(h, dict):
        print(f"⚠️ entry {idx} is not an object, skip")
        continue
    t_raw = h.get("time") or h.get("timestamp") or h.get("date")
    p_raw = h.get("price") or h.get("value") or h.get("close")
    if t_raw is None or p_raw is None:
        print(f"⚠️ entry {idx} missing time or price, skip")
        continue
    try:
        t = parse_time(t_raw)
    except Exception as e:
        print(f"❌ time parse error for entry {idx}: {e}")
        continue
    try:
        p = float(p_raw)
    except Exception as e:
        print(f"❌ price parse error for entry {idx}: {e}")
        continue
    pairs.append((t, p))

# 直近24時間に絞る（UTC基準・naive UTC）
now_utc = datetime.now(timezone.utc).astimezone(timezone.utc).replace(tzinfo=None)
one_day_ago = now_utc - timedelta(hours=24)
pairs = [pair for pair in pairs if pair[0] >= one_day_ago]

# ソート（古い順 = 左端が最古）
pairs.sort(key=lambda x: x[0])

if not pairs:
    # fallback single point
    fallback_price = data.get("stock_price") or 950
    try:
        fallback_price = float(fallback_price)
    except Exception:
        fallback_price = 950.0
    pairs = [(now_utc, fallback_price)]
    print("⚠️ 直近24時間にデータが無かったため、現在時刻の単一点を表示します。")

times = [p[0] for p in pairs]
prices = [p[1] for p in pairs]

# plot
plt.figure(figsize=(8, 4))
plt.plot(times, prices, linestyle='-', linewidth=1.6)  # 点なしの折れ線
plt.xlabel("時間")   # ラベルは「時間」のみ
plt.ylabel("株価")
plt.title("株価（直近1日）")

# 横軸の目盛りを消す（ラベル「時間」だけ残す）
plt.gca().set_xticks([])

plt.grid(True, linestyle="--", alpha=0.6)
plt.tight_layout()

# 出力先（カレントディレクトリ）
output_file = os.path.join(os.getcwd(), "stock.png")
try:
    plt.savefig(output_file)
    plt.close()
    print(f"✅ グラフを保存しました: {output_file}")
except Exception as e:
    print(f"❌ グラフ保存エラー: {e}")
    sys.exit(1)
