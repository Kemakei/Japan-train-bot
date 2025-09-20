import sys
from PIL import Image
from treys import Card, Evaluator

args = sys.argv[1:]
player_cards = args[0:2]
bot_cards = args[2:4]
reveal = args[4] if len(args) > 4 else "0"  # 0=裏, 1=公開

# テーブルと裏カード画像
table = Image.open("images/table.jpg").convert("RGBA")
back = Image.open("images/back.jpg").convert("RGBA")

# プレイヤーのカード
p1 = Image.open(f"images/{player_cards[0]}.png").convert("RGBA")
p2 = Image.open(f"images/{player_cards[1]}.png").convert("RGBA")

# Botのカード（公開か非公開か）
if reveal == "1":
    b1 = Image.open(f"images/{bot_cards[0]}.png").convert("RGBA")
    b2 = Image.open(f"images/{bot_cards[1]}.png").convert("RGBA")
else:
    b1 = back.copy()
    b2 = back.copy()

# 合成位置
table.paste(p1, (100, 400), p1)
table.paste(p2, (200, 400), p2)
table.paste(b1, (100, 100), b1)
table.paste(b2, (200, 100), b2)

output_path = "images/combined.png"
table.save(output_path)

# 勝敗判定
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
