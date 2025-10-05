import sys
import os
from PIL import Image
from treys import Card, Evaluator

args = sys.argv[1:]
if len(args) < 12:  # player5 + bot5 + reveal + output_path
    print("ERROR: 引数が不足しています", file=sys.stderr)
    sys.exit(1)

*cards, reveal, out_path = args
player_cards = cards[:5]
bot_cards = cards[5:10]

base_dir = os.path.dirname(os.path.abspath(__file__))
images_dir = os.path.join(base_dir, "images")
table_path = os.path.join(images_dir, "table.jpg")
back_path = os.path.join(images_dir, "back.jpg")

try:
    table = Image.open(table_path).convert("RGBA")
    back = Image.open(back_path).convert("RGBA")
except FileNotFoundError as e:
    print(f"ERROR: ファイルが見つかりません: {e}", file=sys.stderr)
    sys.exit(1)

CARD_W, CARD_H = 100, 150
total_cards = 5
x_start = 0
spacing = (table.width - CARD_W * total_cards) // (total_cards + 1)
x_positions = [spacing + i * (CARD_W + spacing) for i in range(total_cards)]
y_bot = spacing
y_player = table.height - CARD_H - spacing

# --- Botカード（上段） ---
for i, card in enumerate(bot_cards):
    if reveal == "1":  # コール後は全公開
        img = Image.open(os.path.join(images_dir, f"{card}.png")).convert("RGBA")
    else:  # コール前は全部裏
        img = back.copy()
    img = img.resize((CARD_W, CARD_H), Image.Resampling.LANCZOS)
    x = x_positions[i]
    table.paste(img, (x, y_bot), img)

# --- プレイヤーカード（下段） ---
player_reveal_count = 3 if reveal == "0" else 5  # コール前は3枚見せる（2枚裏）
for i, card in enumerate(player_cards):
    if i < player_reveal_count:
        img = Image.open(os.path.join(images_dir, f"{card}.png")).convert("RGBA")
    else:
        img = back.copy()
    img = img.resize((CARD_W, CARD_H), Image.Resampling.LANCZOS)
    x = x_positions[i]
    table.paste(img, (x, y_player), img)

# --- 出力 ---
table.save(out_path)

# --- 勝敗判定（公開時のみ） ---
if reveal == "1":
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
        winner = "player"
        score = score_player
    elif score_player > score_bot:
        winner = "bot"
        score = score_bot
    else:
        winner = "draw"
        score = 0

    print(f"{winner},{score}")
