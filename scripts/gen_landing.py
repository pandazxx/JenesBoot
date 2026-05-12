#!/usr/bin/env python3
"""
JenesBoot landing screen generator.
Output: public/landing.png  (480x270, max-16-color pixel art)

Palette (14 colors used):
  BG_DEEP     #0a0e1a  deep navy background / void
  BG_WATER    #0f1e2e  dark water fill
  WATER_MID   #163245  midtone water
  WATER_SURF  #1e4d6b  water surface highlight line
  HULL_DARK   #2a2a2e  submarine hull shadow
  HULL_MID    #3c3c44  submarine hull main
  HULL_LIGHT  #5c5c6e  submarine hull highlight
  RIVET       #7a7a88  rivet / detail tick
  ALIEN_TEAL  #00e5cc  alien bioluminescence (teal)
  ALIEN_PURP  #8833cc  alien glow (purple)
  ENEMY_HULL  #4a2a1a  enemy ship hull (rust-brown)
  IRON_CROSS  #6e3a1e  iron cross color on enemy hull
  TEXT_WHITE  #e8e8e0  title / flavor text
  TEXT_DIM    #8888a0  secondary / dimmed text
"""

import os
import sys
from PIL import Image, ImageDraw

W, H = 480, 270

# ---- Palette ---------------------------------------------------------------
BG_DEEP    = (0x0a, 0x0e, 0x1a)
BG_WATER   = (0x0f, 0x1e, 0x2e)
WATER_MID  = (0x16, 0x32, 0x45)
WATER_SURF = (0x1e, 0x4d, 0x6b)
HULL_DARK  = (0x2a, 0x2a, 0x2e)
HULL_MID   = (0x3c, 0x3c, 0x44)
HULL_LIGHT = (0x5c, 0x5c, 0x6e)
RIVET      = (0x7a, 0x7a, 0x88)
ALIEN_TEAL = (0x00, 0xe5, 0xcc)
ALIEN_PURP = (0x88, 0x33, 0xcc)
ENEMY_HULL = (0x4a, 0x2a, 0x1a)
IRON_CROSS = (0x6e, 0x3a, 0x1e)
TEXT_WHITE = (0xe8, 0xe8, 0xe0)
TEXT_DIM   = (0x88, 0x88, 0xa0)

# ---- Helpers ----------------------------------------------------------------

def px(draw, x, y, color):
    """Draw a single pixel."""
    draw.point((x, y), fill=color)


def hline(draw, x0, x1, y, color):
    """Horizontal line."""
    draw.line([(x0, y), (x1, y)], fill=color)


def vline(draw, x, y0, y1, color):
    """Vertical line."""
    draw.line([(x, y0), (x, y1)], fill=color)


def rect_fill(draw, x0, y0, x1, y1, color):
    draw.rectangle([(x0, y0), (x1, y1)], fill=color)


def rect_outline(draw, x0, y0, x1, y1, color):
    draw.rectangle([(x0, y0), (x1, y1)], outline=color)


# ---- Pixel font glyphs (5x7 bitmap, uppercase + limited punctuation) -------
# Each glyph is a list of 7 rows, each row is a 5-bit integer (MSB = leftmost)

GLYPHS = {
    'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
    'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
    'C': [0b01111, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b01111],
    'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
    'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
    'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
    'G': [0b01111, 0b10000, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
    'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
    'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
    'J': [0b11111, 0b00001, 0b00001, 0b00001, 0b10001, 0b10001, 0b01110],
    'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
    'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
    'M': [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b10001],
    'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
    'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
    'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
    'Q': [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
    'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
    'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
    'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
    'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
    'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100],
    'W': [0b10001, 0b10001, 0b10001, 0b10001, 0b10101, 0b11011, 0b10001],
    'X': [0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b01010, 0b10001],
    'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
    'Z': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
    ' ': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
    ':': [0b00000, 0b00100, 0b00100, 0b00000, 0b00100, 0b00100, 0b00000],
    '-': [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
    '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100],
    '.': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100],
}


def draw_text(draw, text, x, y, color, scale=1):
    """Draw pixel-font text starting at (x, y). Scale 1 = 5x7 px per glyph."""
    cx = x
    for ch in text.upper():
        glyph = GLYPHS.get(ch, GLYPHS[' '])
        for row_idx, row_bits in enumerate(glyph):
            for col_idx in range(5):
                if row_bits & (0b10000 >> col_idx):
                    rect_fill(
                        draw,
                        cx + col_idx * scale,
                        y + row_idx * scale,
                        cx + col_idx * scale + scale - 1,
                        y + row_idx * scale + scale - 1,
                        color,
                    )
        cx += (5 + 1) * scale  # 5 px wide + 1 px kerning gap
    return cx  # return right edge


def text_width(text, scale=1):
    return len(text) * (5 + 1) * scale - scale  # last char has no trailing gap


def draw_text_centered(draw, text, cx, y, color, scale=1):
    w = text_width(text, scale)
    draw_text(draw, text, cx - w // 2, y, color, scale)


# ---- Submarine silhouette (player sub, cross-section aesthetic) ------------
# Coordinate origin: left end of hull, mid-line at y=0.
# Caller offsets to canvas position.

def draw_player_sub(draw, ox, oy):
    """
    Draw a FTL-style side-view submarine at canvas offset (ox, oy).
    The sub is roughly 220px wide, 36px tall at the hull.
    Hull mid-line sits at oy.
    """
    # -- Main pressure hull (ellipse-ish, hand-drawn as rectangles) --
    # Base hull: dark then mid
    hull_points = [
        # (x-left, x-right, y-offset-from-midline, color)
        (10,  210, -8,  HULL_DARK),
        (10,  210,  8,  HULL_DARK),
        (5,   215, -7,  HULL_MID),
        (5,   215,  7,  HULL_MID),
        (4,   216, -6,  HULL_MID),
        (4,   216,  6,  HULL_MID),
        (3,   217, -5,  HULL_MID),
        (3,   217,  5,  HULL_MID),
        (2,   218, -4,  HULL_MID),
        (2,   218,  4,  HULL_MID),
        (2,   218, -3,  HULL_MID),
        (2,   218,  3,  HULL_MID),
        (2,   218, -2,  HULL_MID),
        (2,   218,  2,  HULL_MID),
        (2,   218, -1,  HULL_LIGHT),
        (2,   218,  1,  HULL_LIGHT),
        (2,   218,  0,  HULL_LIGHT),
    ]

    # Fill the entire hull body
    for y_off in range(-9, 10):
        # taper at ends
        margin = max(0, abs(y_off) - 1) * 6
        x0 = ox + 2 + margin
        x1 = ox + 218 - margin
        if x0 < x1:
            color = HULL_LIGHT if abs(y_off) <= 1 else (HULL_MID if abs(y_off) <= 5 else HULL_DARK)
            hline(draw, x0, x1, oy + y_off, color)

    # -- Bow nose (tapered right end) --
    for i, y_off in enumerate(range(-8, 9)):
        shrink = abs(y_off)
        x_end = ox + 218 + max(0, 10 - shrink * 2)
        hline(draw, ox + 218, x_end, oy + y_off, HULL_MID)

    # Bow highlight pixel
    px(draw, ox + 226, oy, HULL_LIGHT)

    # -- Stern (blunt left end, with prop shaft stub) --
    for y_off in range(-5, 6):
        hline(draw, ox - 2, ox + 2, oy + y_off, HULL_DARK)
    # Prop shaft
    hline(draw, ox - 8, ox - 2, oy, HULL_DARK)
    hline(draw, ox - 8, ox - 2, oy + 1, HULL_DARK)

    # -- Conning tower (sail) --
    # Positioned at ~45% from left (diesel-era placement)
    sail_x = ox + 70
    sail_y = oy - 9
    sail_h = 14
    sail_w = 28
    # Shadow
    rect_fill(draw, sail_x + 1, sail_y - sail_h + 1, sail_x + sail_w + 1, sail_y, HULL_DARK)
    # Main
    rect_fill(draw, sail_x, sail_y - sail_h, sail_x + sail_w, sail_y, HULL_MID)
    # Highlight cap
    hline(draw, sail_x, sail_x + sail_w, sail_y - sail_h, HULL_LIGHT)
    hline(draw, sail_x, sail_x + sail_w, sail_y - sail_h + 1, HULL_LIGHT)
    # Periscope
    vline(draw, sail_x + 10, sail_y - sail_h - 6, sail_y - sail_h, RIVET)
    vline(draw, sail_x + 11, sail_y - sail_h - 6, sail_y - sail_h, RIVET)
    px(draw, sail_x + 10, sail_y - sail_h - 7, HULL_LIGHT)
    px(draw, sail_x + 11, sail_y - sail_h - 7, HULL_LIGHT)

    # -- Alien laser conduit welded along top hull --
    # A glowing teal stripe from sail to bow
    conduit_y = oy - 3
    for cx in range(sail_x + sail_w + 2, ox + 215, 1):
        col = ALIEN_TEAL if (cx % 4 < 2) else HULL_LIGHT
        px(draw, cx, conduit_y, col)
    # Conduit junction glow node near bow
    node_x = ox + 200
    for dx in range(-2, 3):
        for dy in range(-2, 3):
            if abs(dx) + abs(dy) <= 2:
                px(draw, node_x + dx, conduit_y + dy, ALIEN_TEAL)
    # Purple secondary glow behind node
    for dx in range(-1, 2):
        px(draw, node_x + dx - 4, conduit_y, ALIEN_PURP)

    # -- Window portholes (3 along hull) --
    for port_x in [ox + 30, ox + 130, ox + 165]:
        px(draw, port_x,     oy - 1, ALIEN_TEAL)
        px(draw, port_x + 1, oy - 1, ALIEN_TEAL)
        px(draw, port_x,     oy,     ALIEN_TEAL)
        px(draw, port_x + 1, oy,     ALIEN_TEAL)
        # dark rim
        for dx, dy in [(-1,0),(2,0),(0,-2),(1,-2),(0,1),(1,1)]:
            px(draw, port_x + dx, oy + dy - 1, HULL_DARK)

    # -- Rivet row along hull seam --
    for rx in range(ox + 5, ox + 220, 14):
        px(draw, rx, oy + 5, RIVET)
        px(draw, rx, oy - 5, RIVET)

    # -- Diesel exhaust port (rear, above waterline) --
    rect_fill(draw, ox + 6, oy - 11, ox + 12, oy - 9, HULL_DARK)
    px(draw, ox + 7, oy - 12, HULL_DARK)


# ---- Enemy ship silhouette (surface raider, right side of screen) ----------

def draw_enemy_ship(draw, ox, oy):
    """
    Small enemy surface ship silhouette, viewed from the side.
    Positions so bow faces left (toward player sub).
    Overall width ~90px.  Hull mid-line at oy.
    """
    # Hull base
    for y_off in range(-4, 5):
        margin = abs(y_off) * 4
        x0 = ox + margin
        x1 = ox + 90 - margin
        if x0 < x1:
            color = ENEMY_HULL if abs(y_off) > 1 else IRON_CROSS
            hline(draw, x0, x1, oy + y_off, color)

    # Hull bow (left, sharp)
    for i in range(8):
        hline(draw, ox - i, ox, oy - (4 - i // 2), ENEMY_HULL)
        hline(draw, ox - i, ox, oy + (4 - i // 2), ENEMY_HULL)

    # Superstructure
    rect_fill(draw, ox + 20, oy - 12, ox + 60, oy - 5, ENEMY_HULL)
    rect_fill(draw, ox + 30, oy - 18, ox + 50, oy - 12, ENEMY_HULL)
    # Gun turret on deck fore
    rect_fill(draw, ox + 5, oy - 8, ox + 18, oy - 5, ENEMY_HULL)
    hline(draw, ox + 18, ox + 30, oy - 7, ENEMY_HULL)  # gun barrel

    # Iron Cross emblem on hull side (simplified 5x5)
    cross_x = ox + 55
    cross_y = oy
    for d in range(-1, 2):
        hline(draw, cross_x - 2, cross_x + 2, cross_y + d, IRON_CROSS)
        vline(draw, cross_x + d, cross_y - 2, cross_y + 2, IRON_CROSS)
    # Center pixel slightly brighter
    px(draw, cross_x, cross_y, (0x88, 0x44, 0x22))

    # Smoke stack
    vline(draw, ox + 43, oy - 22, oy - 18, HULL_DARK)
    vline(draw, ox + 44, oy - 22, oy - 18, HULL_DARK)


# ---- Water / background layers ---------------------------------------------

def draw_scene(draw):
    # Sky / void -- deep navy gradient (manual)
    for y in range(H):
        t = y / H
        r = int(0x0a + (0x0a) * t)
        g = int(0x0e + (0x12) * t)
        b = int(0x1a + (0x18) * t)
        hline(draw, 0, W - 1, y, (r, g, b))

    # Water body -- everything below waterline
    water_y = 155  # waterline y on canvas
    for y in range(water_y, H):
        depth = (y - water_y) / (H - water_y)
        r = int(0x0f * (1 - depth * 0.4))
        g = int(0x1e * (1 - depth * 0.5))
        b = int(0x2e * (1 - depth * 0.3))
        hline(draw, 0, W - 1, y, (r, g, b))

    # Water surface shimmer lines
    for y in range(water_y, water_y + 3):
        for x in range(0, W, 4):
            px(draw, x, y, WATER_SURF)
            px(draw, x + 1, y, WATER_SURF)

    # Deeper mid-water band
    for y in range(water_y + 40, water_y + 44):
        for x in range(0, W, 6):
            if (x + y) % 8 < 3:
                px(draw, x, y, WATER_MID)

    # Bioluminescent bubbles / particles (alien influence in the water)
    bubble_coords = [
        (40, 180), (60, 200), (100, 220), (150, 190), (200, 210),
        (250, 185), (310, 215), (360, 195), (410, 225), (450, 200),
        (80, 240), (170, 250), (300, 245), (420, 235),
    ]
    for bx, by in bubble_coords:
        px(draw, bx, by, ALIEN_TEAL)
        px(draw, bx + 1, by, ALIEN_TEAL)
        px(draw, bx, by + 1, ALIEN_TEAL)

    # Purple alien depth glow (bottom of screen)
    for y in range(H - 20, H):
        intensity = (y - (H - 20)) / 20
        for x in range(0, W, 2):
            if (x + y * 3) % 7 < 2:
                alpha_r = int(0x88 * intensity * 0.4)
                alpha_g = int(0x33 * intensity * 0.3)
                alpha_b = int(0xcc * intensity * 0.6)
                px(draw, x, y, (alpha_r, alpha_g, alpha_b))


# ---- Title text -------------------------------------------------------------

def draw_title(draw):
    """
    "JENESBOO T" split to two lines with large pixel font.
    Scale 3 gives 15x21 per glyph — readable at 480px wide.
    Top-center area.
    """
    scale = 3
    line1 = "JENESBOO T"
    # Drop shadow (1px offset, dark)
    draw_text_centered(draw, line1, W // 2 + 1, 20 + 1, BG_DEEP, scale)
    # Main text
    draw_text_centered(draw, line1, W // 2, 20, TEXT_WHITE, scale)

    # Teal alien glow underline beneath title
    title_w = text_width(line1, scale)
    title_x = W // 2 - title_w // 2
    title_bottom = 20 + 7 * scale + 2
    hline(draw, title_x, title_x + title_w, title_bottom, ALIEN_TEAL)
    hline(draw, title_x + 2, title_x + title_w - 2, title_bottom + 1, ALIEN_PURP)


def draw_flavor(draw):
    """Bottom flavor line in smaller pixel font."""
    scale = 2
    text = "LIBERATE THE DEEP"
    draw_text_centered(draw, text, W // 2 + 1, H - 18 + 1, BG_DEEP, scale)
    draw_text_centered(draw, text, W // 2, H - 18, TEXT_DIM, scale)


# ---- Main assembly ---------------------------------------------------------

def generate(out_path):
    img = Image.new("RGB", (W, H), BG_DEEP)
    draw = ImageDraw.Draw(img)

    # Background and water
    draw_scene(draw)

    # Player submarine — partially submerged, hull mid at waterline+4
    sub_ox = 110   # left edge of hull
    sub_oy = 159   # mid-line y (just below waterline)
    draw_player_sub(draw, sub_ox, sub_oy)

    # Enemy ship — far right, surface level
    enemy_ox = 370
    enemy_oy = 155
    draw_enemy_ship(draw, enemy_ox, enemy_oy)

    # Title and flavor
    draw_title(draw)
    draw_flavor(draw)

    # Scanline effect (subtle — every other row gets 10% darker)
    # Do this last so it applies over everything
    pixels = img.load()
    for y in range(0, H, 2):
        for x in range(W):
            r, g, b = pixels[x, y]
            pixels[x, y] = (
                max(0, r - 4),
                max(0, g - 4),
                max(0, b - 4),
            )

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    img.save(out_path, "PNG", optimize=True)
    print(f"Saved {out_path}  ({W}x{H} px)")


if __name__ == "__main__":
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(repo_root, "public", "landing.png")
    if len(sys.argv) > 1:
        out = sys.argv[1]
    generate(out)
