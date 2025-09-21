import json
import matplotlib.pyplot as plt
from datetime import datetime
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
coins_file = os.path.join(BASE_DIR, "../coins.json")
img_file = os.path.join(BASE_DIR, "stock.png")

# データ読み込み
with open(coins_file, "r", encoding="utf-8") as f:
    data = json.load(f)

history = data.get("trade_history", {}).get("coins", [])
if not history:
    history = []

times = [datetime.fromisoformat(h["time"]) for h in history]
prices = [h["price"] for h in history]

if not times:
    times = [datetime.now()]
    prices = [950]

plt.figure(figsize=(8,4))
plt.plot(times, prices, marker='o')
plt.title("株価の推移（直近1日）")
plt.xlabel("時間")
plt.ylabel("価格")
plt.grid(True)
plt.tight_layout()
plt.savefig(img_file)
plt.close()
