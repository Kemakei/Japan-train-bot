# python/graph.py
import sys
import json
import matplotlib.pyplot as plt
from io import BytesIO

def main():
    # Node.js から渡された history を取得
    if len(sys.argv) < 2:
        print("No data passed", file=sys.stderr)
        sys.exit(1)

    history = json.loads(sys.argv[1])
    times = [d['time'][11:16] for d in history]  # HH:MM
    prices = [d['price'] for d in history]

    plt.figure(figsize=(8,4))
    plt.plot(times, prices, marker='o', linestyle='-', color='blue')
    plt.title("株価推移（直近1日）")
    plt.xlabel("時間")
    plt.ylabel("株価")
    plt.grid(True)
    plt.tight_layout()

    buf = BytesIO()
    plt.savefig(buf, format='png')
    buf.seek(0)
    sys.stdout.buffer.write(buf.getvalue())

if __name__ == "__main__":
    main()
