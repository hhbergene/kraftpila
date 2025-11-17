# engine/render.py
"""
Utility functions for drawing primitives and shapes.
Used by both engine (forces) and problem (rendering) modules.
"""
import math
from typing import Tuple
import pygame

import utils.geometry as vec
from utils.settings import get_font


def _aa_line(surf: pygame.Surface, color: Tuple[int, int, int], 
             a: Tuple[float, float], b: Tuple[float, float], width: int = 1):
    """Draw an anti-aliased line, or regular line if width > 1."""
    if width <= 1:
        pygame.draw.aaline(surf, color, a, b)
    else:
        pygame.draw.line(surf, color, a, b, width)


def draw_arrow(surf, start, end, color, width=3):
    """Tegn en pil fra start til end med trekantspiss."""
    pygame.draw.line(surf, color, start, end, width)
    dx, dy = end[0] - start[0], end[1] - start[1]
    if abs(dx) < 1e-6 and abs(dy) < 1e-6:
        return
    ang = math.atan2(dy, dx)
    L = 12
    a = math.pi / 6
    left = (end[0] - L * math.cos(ang - a), end[1] - L * math.sin(ang - a))
    right = (end[0] - L * math.cos(ang + a), end[1] - L * math.sin(ang + a))
    pygame.draw.polygon(surf, color, [end, left, right])


def draw_dotted_line(surf, color, start, end, width=1, dash_size=4):
    """
    Tegner en stiplet (dotted) linje fra start til end.
    
    Args:
        surf: Pygame surface
        color: RGB fargetupel
        start: Start punkt (x, y)
        end: Ende punkt (x, y)
        width: Linjens tykkelse
        dash_size: Størrelse på hver dash (piksel)
    """
    if start == end:
        return
    
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    distance = math.sqrt(dx**2 + dy**2)
    
    if distance < 1e-6:
        return
    
    # Antall dashes (hver dash = dash_size piksler, med gap = dash_size piksler)
    num_dashes = int(distance / (dash_size * 2)) + 1
    
    for i in range(num_dashes):
        # Tegn segment fra i*dash_size til i*dash_size + dash_size
        t1 = (i * dash_size * 2) / distance
        t2 = ((i * dash_size * 2) + dash_size) / distance
        
        # Sikr at vi ikke går utover linjen
        t1 = max(0, min(1, t1))
        t2 = max(0, min(1, t2))
        
        if t1 >= 1:
            break
        
        seg_start = (start[0] + t1 * dx, start[1] + t1 * dy)
        seg_end = (start[0] + t2 * dx, start[1] + t2 * dy)
        pygame.draw.line(surf, color, seg_start, seg_end, width)


def _arrow(surf: pygame.Surface, color: Tuple[int, int, int], 
           a: Tuple[float, float], b: Tuple[float, float], width: int = 2):
    """Draw an arrow from point a to point b (pointing at b)."""
    _aa_line(surf, color, a, b, width)
    # pilhode
    u = vec.sub(a, b)  # peker B <- A
    if vec.norm(u) < 1e-6:
        return
    e = vec.unit(u)
    # Roter enhetsvektor +/- ARROW_HEAD_ANG (radianer) og skaler til ARROW_HEAD_LEN
    ARROW_HEAD_ANG = math.radians(22)
    ARROW_HEAD_LEN = 14
    ang_deg_left = math.degrees(ARROW_HEAD_ANG)
    ang_deg_right = -math.degrees(ARROW_HEAD_ANG)
    left_v = vec.scale(vec.rot_deg(e, ang_deg_left), ARROW_HEAD_LEN)
    right_v = vec.scale(vec.rot_deg(e, ang_deg_right), ARROW_HEAD_LEN)
    left  = vec.add(b, left_v)
    right = vec.add(b, right_v)
    pygame.draw.polygon(surf, color, [b, left, right])


def _circle(surf: pygame.Surface, color: Tuple[int, int, int], 
            p: Tuple[float, float], r: int, width: int = 0):
    """Draw a circle."""
    pygame.draw.circle(surf, color, (int(p[0]), int(p[1])), r, width)


def _text(surf: pygame.Surface, txt: str, pos: Tuple[int, int], 
          color=(0, 0, 0), size=16, anchor="tl", bg=None):
    """
    Draw text on surface.
    
    Args:
        surf: Pygame surface
        txt: Text to draw
        pos: Position tuple (x, y)
        color: RGB color tuple
        size: Font size
        anchor: Anchor point: "tl" (top-left), "tr" (top-right), "mm" (center), "bl" (bottom-left), "br" (bottom-right)
        bg: Optional background color
    """
    font = get_font(size, "Arial")
    img = font.render(txt, True, color, bg)
    r = img.get_rect()
    if anchor == "tl":   # top-left
        r.topleft = pos
    elif anchor == "tr":
        r.topright = pos
    elif anchor == "mm":
        r.center = pos
    elif anchor == "bl":
        r.bottomleft = pos
    elif anchor == "br":
        r.bottomright = pos
    surf.blit(img, r)
