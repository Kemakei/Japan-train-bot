# python/graph.py
import json
import matplotlib.pyplot as plt
from datetime import datetime, timedelta
import sys
import os

coins_file = sys.argv[1]  # tmp_trade_history.json
output_file = sys.argv[2]  # stock.png

if not os.path.exists(coins_file):
    print("No trade history file")
    sys.exit(1)

with open(coins_file, "r") as f:
    data = json.load(f)

history = data.get("trade_history", [])
if not history:
    print("No trade history")
    sys.exit(0)

# 過去1日分に絞る
now = datetime.utcnow()
one_day_ago = now - timedelta(days=1)
history = [h for h in history if datetime.fromisoformat(h["time"]) >= one_day_ago]

if not history:
    print("No recent data")
    sys.exit(0)

times = [datetime.fromisoformat(h["time"]) for h in history]
prices = [h["price"] for h in history]

plt.figure(figsize=(10,5))
plt.plot(times, prices, marker='o', linestyle='-', color='blue')
plt.title("株価推移（直近1日）")
plt.xlabel("時間 (UTC)")
plt.ylabel("株価（コイン）")
plt.grid(True)
plt.tight_layout()
plt.savefig(output_file)
plt.close()
