import json
import matplotlib.pyplot as plt
from datetime import datetime
import os

# coins.json の絶対パス
base_dir = os.path.dirname(os.path.abspath(__file__))
coins_file = os.path.join(base_dir, "coins.json")
output_file = os.path.join(base_dir, "stock.png")

if not os.path.exists(coins_file):
    print("coins.json が存在しません")
    exit(1)

with open(coins_file, "r", encoding="utf-8") as f:
    data = json.load(f)

history = data.get("trade_history", [])
if not history:
    history = [{"time": datetime.now().isoformat(), "price": data.get("stock_price", 950)}]

times = [datetime.fromisoformat(h["time"]) for h in history]
prices = [h["price"] for h in history]

plt.figure(figsize=(8,4))
plt.plot(times, prices, marker='o')
plt.xlabel("時間")
plt.ylabel("株価")
plt.title("株価推移（直近1日）")
plt.xticks(rotation=45)
plt.tight_layout()
plt.grid(True)
plt.savefig(output_file)
plt.close()
