import json
import matplotlib.pyplot as plt
from datetime import datetime, timedelta
import sys
import os
import matplotlib
import matplotlib.dates as mdates

# 日本語フォント指定（文字化け防止）
matplotlib.rcParams['font.family'] = 'IPAexGothic'

# stdin から JSON を読み込む
input_str = sys.stdin.read()
if not input_str:
    print("❌ データが渡されていません")
    sys.exit(1)

try:
    data = json.loads(input_str)
except json.JSONDecodeError as e:
    print(f"❌ JSON 解析エラー: {e}")
    sys.exit(1)

# trade_history を取得
history = data.get("trade_history", [])
if not history:
    history = [{"time": datetime.now().isoformat(), "price": data.get("stock_price", 950)}]

# 直近24時間に絞る
now = datetime.now()
one_day_ago = now - timedelta(hours=24)
filtered = [h for h in history if datetime.fromisoformat(h["time"]) >= one_day_ago]

if not filtered:
    filtered = [{"time": now.isoformat(), "price": data.get("stock_price", 950)}]

# x軸: 時間（datetime）、y軸: 価格
times = [datetime.fromisoformat(h["time"]) for h in filtered]
prices = [h["price"] for h in filtered]

# グラフ作成
plt.figure(figsize=(8, 4))
plt.plot(times, prices, linestyle='-', color='blue')  # ← marker を削除

# 軸ラベルとタイトル
plt.xlabel("時間")        # 横軸ラベルは「時間」
plt.ylabel("株価")        # 縦軸は株価を表示
plt.title("株価（直近1日）")

# 横軸の目盛りを消す（「時間」だけ残す）
plt.gca().set_xticks([])

# 縦軸は通常通り残す
plt.grid(True, linestyle="--", alpha=0.6)
plt.tight_layout()

# 出力ファイル
output_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../stock.png")
plt.savefig(output_file)
plt.close()
