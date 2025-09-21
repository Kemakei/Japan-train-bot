import sys
import json
import matplotlib.pyplot as plt
from datetime import datetime
import os

input_data = sys.stdin.read()
data = json.loads(input_data)

history = data.get("trade_history", [])
if not history:
    history = [{"time": datetime.now().isoformat(), "price": data.get("stock_price", 950)}]

times = [datetime.fromisoformat(h["time"]) for h in history]
prices = [h["price"] for h in history]

base_dir = os.path.dirname(os.path.abspath(__file__))
output_file = os.path.join(base_dir, "../stock.png")

plt.figure(figsize=(8,4))
plt.plot(times, prices, marker='o')
plt.xlabel("時間")
plt.ylabel("株価")
plt.title("株価推移（過去24時間）")
plt.xticks(rotation=45)
plt.tight_layout()
plt.grid(True)
plt.savefig(output_file)
plt.close()
