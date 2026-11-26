"""Makes the two small paper textures used by the book skins (assets/*.png).
Pre-made so phones never compute paper grain while dragging the window."""
import os, random
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'assets')
S = 160

def paper(base, spread, fibers, seed, name):
    random.seed(seed)
    img = Image.new('RGB', (S, S), base)
    px = img.load()
    for y in range(S):
        for x in range(S):
            d = random.randint(-spread, spread)
            r, g, b = base
            px[x, y] = (max(0, min(255, r + d)), max(0, min(255, g + d)), max(0, min(255, b + d - 2)))
    img = img.filter(ImageFilter.GaussianBlur(0.8))
    px = img.load()
    for _ in range(fibers):  # faint fibres, wrapping so the tile has no seams
        x, y = random.randrange(S), random.randrange(S)
        dx, dy = random.choice([(1, 0), (1, 1), (0, 1), (1, -1)])
        shade = random.randint(-14, 8)
        for i in range(random.randint(4, 12)):
            xx, yy = (x + dx * i) % S, (y + dy * i) % S
            r, g, b = px[xx, yy]
            px[xx, yy] = (max(0, min(255, r + shade)), max(0, min(255, g + shade)), max(0, min(255, b + shade)))
    img.save(os.path.join(OUT, name), optimize=True)

os.makedirs(OUT, exist_ok=True)
paper((236, 221, 186), 7, 260, 7, 'paper-tome.png')
paper((38, 30, 30), 5, 200, 11, 'paper-cursed.png')
print('ok')
