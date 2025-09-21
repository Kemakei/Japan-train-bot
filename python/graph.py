import json
import matplotlib.pyplot as plt
from datetime import datetime
import sys
import os

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
    # 履歴が空なら現在の株価のみで初期化
    history = [{"time": datetime.now().isoformat(), "price": data.get("stock_price", 950)}]

# 時刻と株価を分離
times = [datetime.fromisoformat(h["time"]) for h in history]
prices = [h["price"] for h in history]

# グラフ作成
plt.figure(figsize=(8, 4))
plt.plot(times, prices, marker='o', linestyle='-', color='blue')
plt.xlabel("時間")
plt.ylabel("株価")
plt.title("株価推移（直近1日）")
plt.xticks(rotation=45)
plt.grid(True)
plt.tight_layout()

# 出力ファイル
output_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../stock.png")
plt.savefig(output_file)
plt.close()
