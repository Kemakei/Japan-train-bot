import json
import matplotlib.pyplot as plt
from datetime import datetime
import os

script_dir = os.path.dirname(os.path.abspath(__file__))
coins_file = os.path.join(script_dir, "../coins.json")
output_file = os.path.join(script_dir, "stock.png")

# coins.json 読み込み
with open(coins_file, "r", encoding="utf-8") as f:
    data = json.load(f)

history = data.get("history", [])
if not history:
    stock_price = data.get("stock_price", 950)
    history = [{"time": datetime.now().isoformat(), "price": stock_price}]

times = [datetime.fromisoformat(d["time"]) for d in history]
prices = [d["price"] for d in history]

plt.figure(figsize=(10,5))
plt.plot(times, prices, marker='o', linestyle='-', color='green')
plt.title("株価推移（直近24時間）")
plt.xlabel("時間")
plt.ylabel("コイン")
plt.grid(True)
plt.tight_layout()
plt.savefig(output_file)
plt.close()
