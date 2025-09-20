import sys
import os
from PIL import Image
from treys import Card, Evaluator

# --- 引数 ---
args = sys.argv[1:]
player_cards = args[0:2]
bot_cards = args[2:4]
reveal = args[4] if len(args) > 4 else "0"  # 0=裏, 1=公開

# --- ファイルパス絶対化 ---
base_dir = os.path.dirname(os.path.abspath(__file__))
images_dir = os.path.join(base_dir, "images")

# --- テーブルと裏カード画像 ---
table_path = os.path.join(images_dir, "table.jpg")
back_path = os.path.join(images_dir, "back.jpg")

try:
    table = Image.open(table_path).convert("RGBA")
    back = Image.open(back_path).convert("RGBA")
except FileNotFoundError as e:
    print(f"ERROR: ファイルが見つかりません: {e}", file=sys.stderr)
    sys.exit(1)

# --- プレイヤーのカード ---
try:
    p1 = Image.open(os.path.join(images_dir, f"{player_cards[0]}.png")).convert("RGBA")
    p2 = Image.open(os.path.join(images_dir, f"{player_cards[1]}.png")).convert("RGBA")
except FileNotFoundError as e:
    print(f"ERROR: プレイヤーカード画像が見つかりません: {e}", file=sys.stderr)
    sys.exit(1)

# --- Botのカード ---
if reveal == "1":
    try:
        b1 = Image.open(os.path.join(images_dir, f"{bot_cards[0]}.png")).convert("RGBA")
        b2 = Image.open(os.path.join(images_dir, f"{bot_cards[1]}.png")).convert("RGBA")
    except FileNotFoundError as e:
        print(f"ERROR: Botカード画像が見つかりません: {e}", file=sys.stderr)
        sys.exit(1)
else:
    b1 = back.copy()
    b2 = back.copy()

# --- 合成位置 ---
table.paste(p1, (100, 400), p1)
table.paste(p2, (200, 400), p2)
table.paste(b1, (100, 100), b1)
table.paste(b2, (200, 100), b2)

# --- 出力 ---
combined_path = os.path.join(images_dir, "combined.png")
table.save(combined_path)

# --- 勝敗判定 ---
evaluator = Evaluator()

def to_treys(card_str):
    rank = card_str[0]
    suit = card_str[1].lower()
    return Card.new(rank + suit)

player_hand = [to_treys(c) for c in player_cards]
bot_hand = [to_treys(c) for c in bot_cards]

score_player = evaluator.evaluate([], player_hand)
score_bot = evaluator.evaluate([], bot_hand)

if score_player < score_bot:
    print("player")
elif score_player > score_bot:
    print("bot")
else:
    print("draw")
