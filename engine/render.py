# engine/render.py
"""
Utility functions for drawing primitives and shapes.
Used by both engine (forces) and problem (rendering) modules.
"""
import math
from typing import Tuple
import pygame

import utils.geometry as vec
from utils.settings import (get_font, OVERLAY_COLOR_OK, OVERLAY_COLOR_SPAN, 
                            OVERLAY_ALPHA_OK, OVERLAY_ALPHA_SPAN)


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


def draw_circle_overlay(layer, cx, cy, r_ok, r_span):
    """
    Draw a circular feedback overlay with OK zone and transition band.
    
    Args:
        layer: Pygame surface (typically with SRCALPHA)
        cx, cy: Center coordinates
        r_ok: Radius of the solid OK zone (green, filled)
        r_span: Thickness of the transition band (red rings)
    """
    circle_layer = pygame.Surface((int(cx + r_ok + r_span + 2), int(cy + r_ok + r_span + 2)), pygame.SRCALPHA)
    
    # 100%-område (lysegrønt, fylt)
    pygame.draw.circle(circle_layer, (*OVERLAY_COLOR_OK, OVERLAY_ALPHA_OK), (int(cx), int(cy)), int(r_ok))
    # Overgangsområde: tynn, semitransparent ring (lyserødt mot 0%)
    for r in range(int(r_ok), int(r_ok + r_span) + 1, 2):
        t = (1.0-(r - r_ok) / max(1, r_span))  # 0..1 (grønn -> rød når t: 1 -> 0)
        
        # Interpoler farge fra OVERLAY_COLOR_OK til OVERLAY_COLOR_SPAN
        r_val = int(OVERLAY_COLOR_OK[0] + (OVERLAY_COLOR_SPAN[0] - OVERLAY_COLOR_OK[0]) * (1 - t))
        g_val = int(OVERLAY_COLOR_OK[1] + (OVERLAY_COLOR_SPAN[1] - OVERLAY_COLOR_OK[1]) * (1 - t))
        b_val = int(OVERLAY_COLOR_OK[2] + (OVERLAY_COLOR_SPAN[2] - OVERLAY_COLOR_OK[2]) * (1 - t))
        
        # Interpoler alpha
        alpha = int(OVERLAY_ALPHA_SPAN + (OVERLAY_ALPHA_OK - OVERLAY_ALPHA_SPAN) * t)
        
        col = (r_val, g_val, b_val, alpha)
        pygame.draw.circle(circle_layer, col, (int(cx), int(cy)), r, width=3)
    
    layer.blit(circle_layer, (0, 0))


def draw_stadium_overlay(layer, ax, ay, bx, by, r_ok, r_span):
    """
    Draw a stadium/capsule feedback overlay along A→B with semicircles at ends.
    
    Args:
        layer: Pygame surface (typically with SRCALPHA)
        ax, ay: Center of semicircle at point A
        bx, by: Center of semicircle at point B
        r_ok: Radius of the solid OK zone (green, filled)
        r_span: Thickness of the transition band (red rings)
    
    Creates a seamless filled stadium shape with a continuous transition band.
    """
    A = (float(ax), float(ay))
    B = (float(bx), float(by))

    # Bygg ett sammenhengende polygon for kapsel med radius r.
    # Rekkefølge: A+n*r → B+n*r (rett kant) → halvsirkel rundt B (0..π) →
    # B−n*r → A−n*r (rett kant) → halvsirkel rundt A (π..2π).
    def capsule_outline(A, B, r, deg_step=6):
        Ax, Ay = A; Bx, By = B
        dx, dy = (Bx - Ax), (By - Ay)
        L = math.hypot(dx, dy)

        # Degenerert tilfelle: fall tilbake til sirkel
        if L < 1e-6:
            pts = []
            for ang in range(0, 360 + deg_step, deg_step):
                rad = math.radians(ang)
                pts.append((int(Ax + r * math.cos(rad)), int(Ay + r * math.sin(rad))))
            return pts

        # Lokal basis (tangent t og normal n)
        tx, ty = dx / L, dy / L
        nx, ny = -ty, tx

        # Hjelper for å sample halvsirkel med gitt vinkelintervall
        def half_circle(center, start_deg, end_deg, step_deg):
            cx, cy = center
            pts = []
            ang = start_deg
            if end_deg >= start_deg:
                while ang <= end_deg:
                    rad = math.radians(ang)
                    # punkt = c + r*(n*cos + t*sin)
                    px = cx + r * (nx * math.cos(rad) + tx * math.sin(rad))
                    py = cy + r * (ny * math.cos(rad) + ty * math.sin(rad))
                    pts.append((int(px), int(py)))
                    ang += step_deg
                # siste punkt nøyaktig på end_deg
                rad = math.radians(end_deg)
                px = cx + r * (nx * math.cos(rad) + tx * math.sin(rad))
                py = cy + r * (ny * math.cos(rad) + ty * math.sin(rad))
                if pts:
                    pts[-1] = (int(px), int(py))
            else:
                while ang >= end_deg:
                    rad = math.radians(ang)
                    px = cx + r * (nx * math.cos(rad) + tx * math.sin(rad))
                    py = cy + r * (ny * math.cos(rad) + ty * math.sin(rad))
                    pts.append((int(px), int(py)))
                    ang -= step_deg
                rad = math.radians(end_deg)
                px = cx + r * (nx * math.cos(rad) + tx * math.sin(rad))
                py = cy + r * (ny * math.cos(rad) + ty * math.sin(rad))
                if pts:
                    pts[-1] = (int(px), int(py))
            return pts

        # Rettkant-punkter (ytterkantene)
        A_plus  = (Ax + nx * r, Ay + ny * r)
        B_plus  = (Bx + nx * r, By + ny * r)
        B_minus = (Bx - nx * r, By - ny * r)
        A_minus = (Ax - nx * r, Ay - ny * r)

        outline = []
        # 1) rett kant A+ → B+
        outline.append((int(A_plus[0]), int(A_plus[1])))
        outline.append((int(B_plus[0]), int(B_plus[1])))
        # 2) halvsirkel rundt B: 0..180°
        outline += half_circle(B, 0, 180, deg_step)
        # 3) rett kant B- → A-
        outline.append((int(B_minus[0]), int(B_minus[1])))
        outline.append((int(A_minus[0]), int(A_minus[1])))
        # 4) halvsirkel rundt A: 180..360°
        outline += half_circle(A, 180, 360, deg_step)

        return outline

    # Create internal layer
    stadium_layer = pygame.Surface((int(max(ax, bx) + r_ok + r_span + 2), 
                                    int(max(ay, by) + r_ok + r_span + 2)), pygame.SRCALPHA)
    
    poly_ok = capsule_outline(A, B, r_ok, deg_step=4)
    pygame.draw.polygon(stadium_layer, (*OVERLAY_COLOR_OK, OVERLAY_ALPHA_OK), poly_ok)

    if r_span > 0:
        step = 2
        for dr in range(0, int(r_span) + 1, step):
            r_out = r_ok + dr
            r_in  = max(0, r_out - 2)
            t = 1.0 - (dr / max(1, r_span))
            
            # Interpoler farge fra OVERLAY_COLOR_OK til OVERLAY_COLOR_SPAN
            r_val = int(OVERLAY_COLOR_OK[0] + (OVERLAY_COLOR_SPAN[0] - OVERLAY_COLOR_OK[0]) * (1 - t))
            g_val = int(OVERLAY_COLOR_OK[1] + (OVERLAY_COLOR_SPAN[1] - OVERLAY_COLOR_OK[1]) * (1 - t))
            b_val = int(OVERLAY_COLOR_OK[2] + (OVERLAY_COLOR_SPAN[2] - OVERLAY_COLOR_OK[2]) * (1 - t))
            
            # Interpoler alpha
            alpha = int(OVERLAY_ALPHA_SPAN + (OVERLAY_ALPHA_OK - OVERLAY_ALPHA_SPAN) * t)

            outer = capsule_outline(A, B, r_out, deg_step=6)
            inner = capsule_outline(A, B, r_in,  deg_step=6)
            if len(outer) >= 3 and len(inner) >= 3:
                ring_poly = outer + list(reversed(inner))
                pygame.draw.polygon(stadium_layer, (r_val, g_val, b_val, alpha), ring_poly)

    layer.blit(stadium_layer, (0, 0))

def draw_wedge_overlay(layer, cx, cy, heading_deg, ang_ok, ang_span, r_ok, r_span):
    """
    Draw a wedge-shaped feedback overlay with OK zone and transition band.
    Uses 4 polygon zones with adaptive angular steps per arc.
    
    Three zones:
    - Zone 1: r <= r_ok, ang <= ang_ok → OVERLAY_COLOR_OK, OVERLAY_ALPHA_OK
    - Zone 2: r <= r_ok, ang > ang_ok → OVERLAY_COLOR_OK, OVERLAY_ALPHA_SPAN
    - Zone 3: r > r_ok, ang > ang_ok → OVERLAY_COLOR_SPAN, OVERLAY_ALPHA_SPAN
    
    Args:
        layer: Pygame surface (typically with SRCALPHA)
        cx, cy: Center coordinates
        heading_deg: Wedge orientation in degrees (0 = right, 90 = down, etc.)
        ang_ok: Angular width of the solid OK zone (green, filled) in degrees
        ang_span: Angular width of the transition band (red rings) in degrees
        r_ok: Radius of the solid OK zone (green, filled)
        r_span: Thickness of the transition band (red rings)
    """
    r_max = r_ok + r_span
    ang_total = ang_ok + ang_span
    ang_center = heading_deg
    
    def build_arc_points(r_inner, r_outer, ang_start, ang_end, heading):
        """Build polygon points for an arc sector with adaptive angular steps."""
        points = []
        
        # Adaptive angular step based on outer radius
        if r_outer > 0:
            delta_ang = 5.*(180.0 / math.pi) / r_outer
        else:
            delta_ang = 6
        
        # Inner arc (r_inner)
        ang = ang_start
        while ang <= ang_end:
            ang_abs = heading + ang
            rad = math.radians(ang_abs)
            x = cx + r_inner * math.cos(rad)
            y = cy + r_inner * math.sin(rad)
            points.append((x, y))
            ang += delta_ang
        # Ensure endpoint
        ang_abs = heading + ang_end
        rad = math.radians(ang_abs)
        points.append((cx + r_inner * math.cos(rad), cy + r_inner * math.sin(rad)))
        
        # Outer arc (r_outer) in reverse
        ang = ang_end
        while ang >= ang_start:
            ang_abs = heading + ang
            rad = math.radians(ang_abs)
            x = cx + r_outer * math.cos(rad)
            y = cy + r_outer * math.sin(rad)
            points.append((x, y))
            ang -= delta_ang
        # Ensure startpoint
        ang_abs = heading + ang_start
        rad = math.radians(ang_abs)
        points.append((cx + r_outer * math.cos(rad), cy + r_outer * math.sin(rad)))
        
        return points
    
    # Zone 1: r <= r_ok, ang <= ang_ok (OK color, OK alpha)
    if r_ok > 0 and ang_ok > 0:
        poly_1r = build_arc_points(0, r_ok, 0, ang_ok, ang_center)
        poly_1l = build_arc_points(0, r_ok, -ang_ok, 0, ang_center)
        pygame.draw.polygon(layer, (*OVERLAY_COLOR_OK, OVERLAY_ALPHA_OK), poly_1r)
        pygame.draw.polygon(layer, (*OVERLAY_COLOR_OK, OVERLAY_ALPHA_OK), poly_1l)
        poly_1r = build_arc_points(r_ok,r_max, 0, ang_ok, ang_center)
        poly_1l = build_arc_points(r_ok,r_max, -ang_ok, 0, ang_center)
        pygame.draw.polygon(layer, (*OVERLAY_COLOR_OK, OVERLAY_ALPHA_SPAN), poly_1r)
        pygame.draw.polygon(layer, (*OVERLAY_COLOR_OK, OVERLAY_ALPHA_SPAN), poly_1l)
    
    # Zone 2: r <= r_ok, ang > ang_ok (OK color, SPAN alpha)
    if r_ok > 0 and ang_span > 0:
        poly_2r = build_arc_points(0, r_ok, ang_ok, ang_total, ang_center)
        poly_2l = build_arc_points(0, r_ok, -ang_total, -ang_ok, ang_center)
        pygame.draw.polygon(layer, (*OVERLAY_COLOR_SPAN, OVERLAY_ALPHA_SPAN), poly_2r)
        pygame.draw.polygon(layer, (*OVERLAY_COLOR_SPAN, OVERLAY_ALPHA_SPAN), poly_2l)
    
    # Zone 3: r > r_ok, ang > ang_ok (SPAN color, SPAN alpha)
    if r_span > 0 and ang_span > 0:
        poly_3r = build_arc_points(r_ok, r_max, ang_ok, ang_total, ang_center)
        poly_3l = build_arc_points(r_ok, r_max, -ang_total, -ang_ok, ang_center)
        pygame.draw.polygon(layer, (*OVERLAY_COLOR_SPAN, OVERLAY_ALPHA_SPAN), poly_3r)
        pygame.draw.polygon(layer, (*OVERLAY_COLOR_SPAN, OVERLAY_ALPHA_SPAN), poly_3l)

def draw_wedge_overlay_texturemap(layer, cx, cy, heading_deg, ang_ok, ang_span, r_ok, r_span):
    """
    Draw a wedge-shaped feedback overlay with OK zone and transition band.
    Uses a pre-computed rectangular texture mapped to polar coordinates.
    
    Args:
        layer: Pygame surface (typically with SRCALPHA)
        cx, cy: Center coordinates
        heading_deg: Wedge orientation in degrees (0 = right, 90 = down, etc.)
        ang_ok: Angular width of the solid OK zone (green, filled) in degrees
        ang_span: Angular width of the transition band (red rings) in degrees
        r_ok: Radius of the solid OK zone (green, filled)
        r_span: Thickness of the transition band (red rings)
    """
    r_max = r_ok + r_span
    ang_total = ang_ok + ang_span
    
    # --- Create rectangular texture (angle x radius) ---
    # Width: angle range (ang_ok in center, ang_span on sides)
    # Height: radius range (r_ok to r_ok+r_span)
    tex_w = int(ang_total) + 1
    tex_h = int(r_max) + 1
    texture = pygame.Surface((tex_w, tex_h), pygame.SRCALPHA)
    
    # Fill texture with colors based on distance from center
    for ty in range(tex_h):
        # ty=0 at r_ok, ty=r_span at r_ok+r_span
        radius_progress = ty / max(1, r_max)
        
        for tx in range(tex_w):
            # tx=0 at -ang_total/2, tx=tex_w-1 at +ang_total/2
            # Find angular distance from center (heading)
            ang_from_center = (tx - tex_w / 2) / (tex_w - 1) * ang_total
            ang_dist = abs(ang_from_center)
            
            # Determine if pixel is in OK zone or transition
            if ang_dist <= ang_ok / 2:
                # In OK zone: constant color/alpha
                color = (*OVERLAY_COLOR_OK, OVERLAY_ALPHA_OK)
            else:
                # In transition zone: interpolate by radius progress
                color_progress = radius_progress
                
                r_val = int(OVERLAY_COLOR_OK[0] + (OVERLAY_COLOR_SPAN[0] - OVERLAY_COLOR_OK[0]) * color_progress)
                g_val = int(OVERLAY_COLOR_OK[1] + (OVERLAY_COLOR_SPAN[1] - OVERLAY_COLOR_OK[1]) * color_progress)
                b_val = int(OVERLAY_COLOR_OK[2] + (OVERLAY_COLOR_SPAN[2] - OVERLAY_COLOR_OK[2]) * color_progress)
                alpha = int(OVERLAY_ALPHA_OK + (OVERLAY_ALPHA_SPAN - OVERLAY_ALPHA_OK) * color_progress)
                
                color = (r_val, g_val, b_val, alpha)
            
            texture.set_at((tx, ty), color)
    
    # --- Map texture to polar wedge ---
    r_max = r_ok + r_span
    
    # Iterate over bounding box and sample from texture
    x_min = int(cx - r_max - 1)
    x_max = int(cx + r_max + 1)
    y_min = int(cy - r_max - 1)
    y_max = int(cy + r_max + 1)
    
    for py in range(max(0, y_min), min(layer.get_height(), y_max)):
        for px in range(max(0, x_min), min(layer.get_width(), x_max)):
            # Convert pixel to relative coordinates from center
            dx = px - cx
            dy = py - cy
            
            # Convert to polar coordinates
            radius = math.sqrt(dx * dx + dy * dy)
            
            # Only render within wedge radius
            if radius > r_max:
                continue
            
            angle_rad = math.atan2(dy, dx)
            angle_deg = math.degrees(angle_rad)
            
            # Normalize angle to [0, 360)
            if angle_deg < 0:
                angle_deg += 360
            heading_norm = heading_deg % 360
            
            # Compute angular distance (shortest path on circle)
            ang_dist = abs(angle_deg - heading_norm)
            if ang_dist > 180:
                ang_dist = 360 - ang_dist
            
            # Check if within wedge angle
            if ang_dist > ang_total / 2:
                continue
            
            # Check if within radius
            if radius > r_max:
                continue
            
            # Map to texture coordinates
            # X: angle mapping (centered at heading)
            tex_x = int(((ang_total / 2 - ang_dist) / (ang_total / 2)) * (tex_w - 1) / 2)
            
            # Y: radius mapping (from r_ok to r_max)
            if radius <= r_ok:
                tex_y = 0
            else:
                tex_y = int((radius - r_ok) / r_span * (tex_h - 1))
                tex_y = min(tex_y, tex_h - 1)
            
            # Sample texture
            if 0 <= tex_x < tex_w and 0 <= tex_y < tex_h:
                color = texture.get_at((tex_x, tex_y))
                layer.set_at((px, py), color)

def draw_live_feedback(screen, pct: float, lines: list[str], *,
                       top_right: tuple[int, int] = None,
                       max_width: int = 320,
                       max_lines: int = 6,
                       overlays: list[dict] = None):
    """
    Draw a simple live HUD (non-modal): percentage + hint lines + global overlays.
    
    Args:
        screen: Pygame surface to draw on
        pct: Completion percentage (0.0 to 1.0)
        lines: List of hint/feedback message strings
        top_right: Position tuple (x, y) for bottom-right corner of HUD box. 
                   If None, uses screen dimensions with margin.
        max_width: Maximum width of HUD box in pixels
        max_lines: Maximum number of hint lines to display
        overlays: List of overlay dicts with keys: 
                  - "type": "circle" or "stadium"
                  - "center": (cx, cy) for circles
                  - "a", "b": endpoints for stadium
                  - "r_ok": radius of OK zone
                  - "r_span": thickness of transition band
    """
    if top_right is None:
        # Default: bit margin from right edge
        W = screen.get_width()
        H = screen.get_height()
        bottom_right = (W - 16, H - 16)
    else:
        # Use given top_right (right corner) as reference
        bottom_right = top_right

    # Draw global overlays first (under HUD box)
    if overlays:
        overlay_layer = pygame.Surface((screen.get_width(), screen.get_height()), pygame.SRCALPHA)
        
        # Tegn alle overlays på samme layer med alpha-blending
        for it in overlays:
            t = it.get("type")
            if t == "circle":
                cx, cy = it["center"]
                draw_circle_overlay(overlay_layer, cx, cy, it["r_ok"], it["r_span"])
            elif t == "stadium":
                (ax, ay) = it["a"]
                (bx, by) = it["b"]
                draw_stadium_overlay(overlay_layer, ax, ay, bx, by, it["r_ok"], it["r_span"])
            elif t == "wedge":
                cx, cy = it["center"]
                heading_deg = it["heading_deg"]
                ang_ok = it["ang_ok"]
                ang_span = it["ang_span"]
                r_ok = it["r_ok"]
                r_span = it["r_span"]
                draw_wedge_overlay(overlay_layer, cx, cy, heading_deg, ang_ok, ang_span, r_ok, r_span)

        # Tegn med BLEND_ALPHA_SDL2 for riktig alpha-blending
        screen.blit(overlay_layer, (0, 0))

    # Choose small fonts
    font_title = get_font(18)
    font_body  = get_font(14)

    # Build text lines (clip to max_lines)
    title = f"{round(pct*100)} % riktig"
    body_lines = (lines or [])[:max_lines]

    # Measure width/height
    title_surf = font_title.render(title, True, (20,20,20))
    line_surfs = [font_body.render(s, True, (40,40,40)) for s in body_lines]

    inner_w = min(max(title_surf.get_width(),
                      *(ls.get_width() for ls in line_surfs) if line_surfs else [0]),
                  max_width - 24)
    inner_h = title_surf.get_height() + 8 + sum(ls.get_height() + 4 for ls in line_surfs)

    pad  = 10
    box_w = inner_w + 2*pad
    box_h = inner_h + 2*pad

    # Position rectangle with right edge anchored in bottom_right
    box_x = bottom_right[0] - box_w
    box_y = bottom_right[1] - box_h
    rect = pygame.Rect(box_x, box_y, box_w, box_h)

    # Background
    bg = pygame.Surface((box_w, box_h), pygame.SRCALPHA)
    bg.fill((245, 245, 245, 230))
    pygame.draw.rect(bg, (100,100,100), bg.get_rect(), width=1, border_radius=8)

    # Title color based on pct (same logic as show_feedback)
    color = (0, 160, 0) if pct >= 0.8 else (200, 150, 0) if pct >= 0.5 else (200, 50, 50)
    title_surf_colored = font_title.render(title, True, color)

    # Blit box
    screen.blit(bg, (box_x, box_y))

    # Draw text
    cx = box_x + pad
    cy = box_y + pad
    screen.blit(title_surf_colored, (cx, cy))
    cy += title_surf.get_height() + 8

    for ls in line_surfs:
        # Hard clip in width (no wrapping for simplicity)
        if ls.get_width() > inner_w:
            # clip-surface
            crop = pygame.Surface((inner_w, ls.get_height()), pygame.SRCALPHA)
            crop.blit(ls, (0,0))
            screen.blit(crop, (cx, cy))
        else:
            screen.blit(ls, (cx, cy))
        cy += ls.get_height() + 4
