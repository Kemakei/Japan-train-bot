import json
from datetime import datetime
import matplotlib.pyplot as plt
import os

# ファイルパス
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
history_file = os.path.join(BASE_DIR, "trade_history.json")
output_file = os.path.join(BASE_DIR, "stock.png")

# 履歴読み込み
with open(history_file, "r") as f:
    history = json.load(f)

if not history:
    print("No data")
    exit()

times = [datetime.fromisoformat(d["time"]) for d in history]
prices = [d["price"] for d in history]

plt.figure(figsize=(8, 4))
plt.plot(times, prices, marker='o', linestyle='-', color='blue')
plt.title("株価推移（直近1日）")
plt.xlabel("時間")
plt.ylabel("コイン")
plt.grid(True)
plt.tight_layout()
plt.savefig(output_file)
plt.close()
