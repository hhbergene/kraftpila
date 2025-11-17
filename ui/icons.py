import math
import pygame
from typing import Callable, Dict, Tuple, Optional

def _mk_icon_surface(size: Tuple[int, int], bg: Optional[Tuple[int,int,int,int]] = None) -> pygame.Surface:
    w, h = size
    surf = pygame.Surface((w, h), pygame.SRCALPHA, 32).convert_alpha()
    if bg is not None:
        if len(bg) == 3:
            surf.fill((*bg, 255))
        else:
            surf.fill(bg)
    return surf

def _apply_rotation_and_fit(icon: pygame.Surface, target_size: Tuple[int,int], angle: float) -> pygame.Surface:
    if not angle:
        if icon.get_size() != target_size:
            icon = pygame.transform.smoothscale(icon, target_size)
        return icon
    rotated = pygame.transform.rotate(icon, angle)
    fitted  = pygame.transform.smoothscale(rotated, target_size)
    return fitted

def _stroke_from_size(size: Tuple[int,int], stroke: Optional[int], factor: float = 0.10) -> int:
    if stroke is not None:
        return max(1, int(stroke))
    s = min(size)
    return max(2, int(s * factor))

def _pad_from_size(size: Tuple[int,int], factor: float = 0.14, min_px: int = 2) -> int:
    s = min(size)
    return max(min_px, int(s * factor))

# ------------------ IKONER ------------------

def _impl_grid(icon: pygame.Surface, color, stroke, variant):
    w, h = icon.get_size()
    pad = _pad_from_size((w,h), 0.16)
    stroke = _stroke_from_size((w,h), stroke, 0.09)

    cols = 3
    rows = 3
    cell_w = (w - 2*pad) / cols
    cell_h = (h - 2*pad) / rows

    rect_outer = pygame.Rect(pad, pad, w - 2*pad, h - 2*pad)
    pygame.draw.rect(icon, color, rect_outer, stroke)

    for c in range(1, cols):
        x = pad + c*cell_w
        pygame.draw.line(icon, color, (x, pad), (x, h - pad), stroke)

    for r in range(1, rows):
        y = pad + r*cell_h
        pygame.draw.line(icon, color, (pad, y), (w - pad, y), stroke)

def _impl_snap(icon: pygame.Surface, color, stroke, variant):
    w, h = icon.get_size()
    pad = _pad_from_size((w,h), 0.18)
    stroke = _stroke_from_size((w,h), stroke, 0.12)

    cx, cy = w//2, h//2
    r = (min(w,h)//2) - pad

    pygame.draw.circle(icon, color, (cx, cy), r, stroke)

    pygame.draw.line(icon, color, (cx - r, cy), (cx - r//2, cy), stroke)
    pygame.draw.line(icon, color, (cx + r//2, cy), (cx + r, cy), stroke)
    pygame.draw.line(icon, color, (cx, cy - r), (cx, cy - r//2), stroke)
    pygame.draw.line(icon, color, (cx, cy + r//2), (cx, cy + r), stroke)

    cap_r = max(1, stroke//2)
    pygame.draw.circle(icon, color, (cx, cy), cap_r)

def _impl_reset(icon: pygame.Surface, color, stroke, variant):
    w, h = icon.get_size()
    size = min(w, h)
    pad = _pad_from_size((w,h), 0.14)
    stroke = _stroke_from_size((w,h), stroke, 0.10)

    cx, cy = w // 2, h // 2
    r = (size // 2) - pad
    arc_rect = pygame.Rect(0, 0, 2 * r, 2 * r); arc_rect.center = (cx, cy)

    start_angle = math.radians(40)
    end_angle   = math.radians(360 - 20)
    pygame.draw.arc(icon, color, arc_rect, start_angle, end_angle, stroke)

    ax = cx + r * math.cos(end_angle)
    ay = cy + r * math.sin(end_angle)
    tx = -math.sin(end_angle)
    ty =  math.cos(end_angle)

    head_len = max(6, int(size * 0.22))
    head_w   = max(4, int(stroke * 1.2))

    bx = ax - tx * head_len
    by = ay - ty * head_len
    nx, ny = -ty, tx

    p1 = (ax, ay)
    p2 = (bx + nx * head_w * 0.5, by + ny * head_w * 0.5)
    p3 = (bx - nx * head_w * 0.5, by - ny * head_w * 0.5)
    pygame.draw.polygon(icon, color, (p1, p2, p3))

def _impl_check(icon: pygame.Surface, color, stroke, variant):
    w, h = icon.get_size()
    size = min(w, h)
    pad = _pad_from_size((w,h), 0.18)
    stroke = _stroke_from_size((w,h), stroke, 0.12)

    pA = (pad,                      h - pad - int(size * 0.18))
    pB = (pad + int(size * 0.30),   h - pad)
    pC = (w - pad,                  pad)

    pygame.draw.line(icon, color, pA, pB, stroke)
    pygame.draw.line(icon, color, pB, pC, stroke)

    cap_r = max(1, stroke // 2)
    pygame.draw.circle(icon, color, pA, cap_r)
    pygame.draw.circle(icon, color, pB, cap_r)
    pygame.draw.circle(icon, color, pC, cap_r)

def _impl_arrow(icon: pygame.Surface, color, stroke, variant):
    """
    variant: 'next' | 'prev' | 'right' | 'left'
    'next' og 'right' peker mot høyre, 'prev' og 'left' peker mot venstre.
    """
    w, h = icon.get_size()
    size = min(w, h)
    pad = _pad_from_size((w,h), 0.16)
    stroke = _stroke_from_size((w,h), stroke, 0.12)

    # baselinje horisontal
    y = h // 2
    x0 = pad
    x1 = w - pad

    # Retning
    to_right = True
    if variant in ("prev", "left"):
        to_right = False

    if to_right:
        shaft_start = (x0, y)
        shaft_end   = (x1 - int(size*0.22), y)
        tip_center  = (x1 - int(size*0.10), y)
        sign = 1
    else:
        shaft_start = (x1, y)
        shaft_end   = (x0 + int(size*0.22), y)
        tip_center  = (x0 + int(size*0.10), y)
        sign = -1

    pygame.draw.line(icon, color, shaft_start, shaft_end, stroke)

    tip_len = max(6, int(size * 0.24))
    tip_w   = max(6, int(size * 0.20))
    # trekantspiss
    p1 = (tip_center[0], tip_center[1])
    p2 = (tip_center[0] - sign*tip_len, tip_center[1] - tip_w//2)
    p3 = (tip_center[0] - sign*tip_len, tip_center[1] + tip_w//2)
    pygame.draw.polygon(icon, color, (p1, p2, p3))

# ------------------ REGISTRER ------------------

_IMPLS: Dict[str, Callable[[pygame.Surface, Tuple[int,int,int], Optional[int], Optional[str]], None]] = {
    "grid":   _impl_grid,
    "snap":   _impl_snap,
    "reset":  _impl_reset,
    "check":  _impl_check,
    "arrow":  _impl_arrow,  # bruker variant 'next'/'prev'
}

# ------------------ FACTORY + PUBLIC API ------------------

class IconFactory:
    def __init__(self):
        self._cache: Dict[Tuple, pygame.Surface] = {}

    def _key(self, name: str, size: Tuple[int,int], color, stroke, angle, bg, variant) -> Tuple:
        return (name, size[0], size[1], tuple(color), None if stroke is None else int(stroke),
                float(angle), tuple(bg) if bg is not None else None, variant)

    def get(self, name: str, size: Tuple[int,int], *, color=(30,30,30), bg=None,
            stroke: Optional[int]=None, angle: float=0.0, variant: Optional[str]=None) -> pygame.Surface:
        if name not in _IMPLS:
            raise ValueError(f"Ukjent ikon '{name}'. Kjente: {list(_IMPLS)}")
        key = self._key(name, size, color, stroke, angle, bg, variant)
        found = self._cache.get(key)
        if found is not None:
            return found

        base = _mk_icon_surface(size, bg)
        _IMPLS[name](base, color, stroke, variant)
        final = _apply_rotation_and_fit(base, size, angle)
        self._cache[key] = final
        return final

_factory_singleton = IconFactory()

def _draw_generic(name: str, surf: pygame.Surface, rect: pygame.Rect, *,
                  color=(30,30,30), bg=None, stroke=None, angle: float = 0.0, variant: Optional[str] = None) -> None:
    icon = _factory_singleton.get(name, (rect.w, rect.h), color=color, bg=bg, stroke=stroke, angle=angle, variant=variant)
    surf.blit(icon, rect.topleft)

def draw_grid_icon(surf: pygame.Surface, rect: pygame.Rect, *, color=(30,30,30), bg=None, stroke=None, angle: float = 0.0, variant: Optional[str] = None):
    _draw_generic("grid", surf, rect, color=color, bg=bg, stroke=stroke, angle=angle, variant=variant)

def draw_snap_icon(surf: pygame.Surface, rect: pygame.Rect, *, color=(30,30,30), bg=None, stroke=None, angle: float = 0.0, variant: Optional[str] = None):
    _draw_generic("snap", surf, rect, color=color, bg=bg, stroke=stroke, angle=angle, variant=variant)

def draw_reset_icon(surf: pygame.Surface, rect: pygame.Rect, *, color=(30,30,30), bg=None, stroke=None, angle: float = 0.0, variant: Optional[str] = None):
    _draw_generic("reset", surf, rect, color=color, bg=bg, stroke=stroke, angle=angle, variant=variant)

def draw_check_icon(surf: pygame.Surface, rect: pygame.Rect, *, color=(30,30,30), bg=None, stroke=None, angle: float = 0.0, variant: Optional[str] = None):
    _draw_generic("check", surf, rect, color=color, bg=bg, stroke=stroke, angle=angle, variant=variant)

def draw_next_icon(surf: pygame.Surface, rect: pygame.Rect, *, color=(30,30,30), bg=None, stroke=None, angle: float = 0.0):
    _draw_generic("arrow", surf, rect, color=color, bg=bg, stroke=stroke, angle=angle, variant="next")

def draw_prev_icon(surf: pygame.Surface, rect: pygame.Rect, *, color=(30,30,30), bg=None, stroke=None, angle: float = 0.0):
    _draw_generic("arrow", surf, rect, color=color, bg=bg, stroke=stroke, angle=angle, variant="prev")

def get_icon_factory() -> IconFactory:
    return _factory_singleton
