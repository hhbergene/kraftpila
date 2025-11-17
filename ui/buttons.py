# ui/buttons.py

import pygame
import math
from utils.settings import get_font, get_font_stack
from utils.settings import ACTIVE_BG, INACTIVE_BG, BUTTON_ON, BUTTON_OFF, TEXT_COLOR

class Button:
#TODO: Legge til en enkel parser for tekstboks. "=" deler opp teksten. Det som står før "=" er navn på kraft som før. Etter = kommer lengde på kraft med flere mulige notasjoner.  [x,y] eller (x,y) gir lengde i x-retning og y-retning. Uten parentes gir lengde i tegnet retning.  Bruk av ny variabel "feks mg", definerer variabelen i en dict til gjeldende verdi (basert på tegnet kraft, Hvis kraft ikke er tegnet legg inn None). Hvis variabel allerede er definert bruk samme verdi, .  Parsing kun etter Enter - tast. 
    def __init__(self, x, y, w, h, text, callback, icon=None, type="button"):
        self.rect = pygame.Rect(x, y, w, h)
        self.text = text
        self.callback = callback
        self.icon = icon
        self.pressed = False
        self.active = False
        self.type = type  # "button" | "hover"

    def set_text(self, text):
        self.text = text

    def handle_event(self, e):
        if self.type == "button":
            if e.type == pygame.MOUSEBUTTONDOWN and self.rect.collidepoint(e.pos):
                self.pressed = True
                return True
            elif e.type == pygame.MOUSEBUTTONUP:
                if self.pressed and self.rect.collidepoint(e.pos):
                    self.callback()
                    self.pressed = False
                    return True
                self.pressed = False
                return False
        elif self.type == "hover":
            if e.type == pygame.MOUSEMOTION:
                if self.rect.collidepoint(e.pos):
                    if not self.active:
                        self.active = True
                        self.callback()
                        return True
                else:
                    self.active = False
        return False

    def draw(self, surf, on=False):
        color = BUTTON_ON if on else BUTTON_OFF
        pygame.draw.rect(surf, color, self.rect, border_radius=6)
        pygame.draw.rect(surf, (80, 80, 80), self.rect, 2, border_radius=6)

        # BRUK IKON-FONT (emoji) slik at ✅ ➡ 🧲 osv vises korrekt
        font = get_font_stack("icons", 20)

        label = f"{self.icon} {self.text}" if self.icon else self.text
        txtsurf = font.render(label, True, TEXT_COLOR)
        surf.blit(txtsurf, txtsurf.get_rect(center=self.rect.center))


def _icon_rect_for_button(rect: pygame.Rect) -> pygame.Rect:
    """
    Felles ikon-rektangel: samme beregning som draw_grid_icon.
    Sikrer identisk størrelse/posisjon for alle knappeikoner.
    """
    outer_margin = 8
    size = min(rect.height - outer_margin, rect.width - outer_margin)
    if size <= 8:
        size = max(9, min(rect.height, rect.width) - 2)  # nødverdi
    return pygame.Rect(rect.x + outer_margin // 2,
                       rect.centery - size // 2, size, size)

def draw_arrow_icon(surf: pygame.Surface, rect: pygame.Rect, *,
                    direction: str = "right",  # "right" | "left"
                    bg=None,                   # bakgrunn for ikonfelt (f.eks. BG_COLOR)
                    color=None,                # pilfarge (default: TEXT_COLOR)
                    disabled: bool = False):
    """
    Tegner en horisontal pil (→ eller ←) inni ikon-rektangelet.
    - Samme ikon-rektangel/marger som draw_grid_icon (pixel-match).
    - Ingen font/emoji – ren vektor-tegning.
    """
    icon_rect = _icon_rect_for_button(rect)
    size = icon_rect.w

    # 90% av ikonfeltet, sentrert
    inner_size = max(8, int(round(size * 0.90)))
    icon = pygame.Surface((inner_size, inner_size), pygame.SRCALPHA)

    if bg is not None:
        icon.fill(bg if len(bg) == 3 else (*bg[:3], 255))

    col = color or TEXT_COLOR
    if disabled:
        col = (150, 150, 150)

    # Geometri – lag en pen pil som fyller ~70% av bredden
    pad = max(2, size // 8)
    shaft_th = max(2, size // 4)      # tykkelse på "skaftet"
    head_len = max(6, size // 3)       # lengde på "hodet"
    head_w   = max(6, size // 2)       # bredde på "hodet"

    cy   = size // 2
    x_lo = pad + 1
    x_hi = size - pad - 1

    dir_right = (direction.lower() != "left")

    if dir_right:
        tail      = (x_lo, cy)
        tip_x     = x_hi
        shaft_end = (tip_x - head_len, cy)
        base1     = (tip_x - head_len, cy - head_w // 2)
        base2     = (tip_x - head_len, cy + head_w // 2)
        tip       = (tip_x, cy)
    else:
        tail      = (x_hi, cy)
        tip_x     = x_lo
        shaft_end = (tip_x + head_len, cy)
        base1     = (tip_x + head_len, cy - head_w // 2)
        base2     = (tip_x + head_len, cy + head_w // 2)
        tip       = (tip_x, cy)

    # Skaft slutter nøyaktig i pilhodets basis → ingen overlapp inn i hodet
    pygame.draw.line(icon, col, tail, shaft_end, shaft_th)
    pygame.draw.polygon(icon, col, [tip, base1, base2])

    dst = icon.get_rect(center=icon_rect.center)
    surf.blit(icon, dst.topleft)

    
def draw_grid_icon(surf: pygame.Surface, rect: pygame.Rect, *,
                   color=(200,200,200),
                   bg=None,                 # fyll ikonbakgrunn (bruk BG_COLOR for "tomt" ikon-look)
                   rotate_deg: float = 0.0, # vinkel på gridet (ikon selv roteres ikke)
                   disabled: bool = False):
    """
    Tegner et 2x2-rutenett inne i et kvadratisk ikonfelt.
    - Ikonets ramme er IKKE rotert; kun selve gridet roteres inni.
    - Linjene stikker en halv celle utenfor 2x2-kjernens lengde,
      men alt holder seg komfortabelt innenfor ikonfeltet.
    - rotate_deg=0 → normalt (XY) rutenett. Ellers NP-lignende retning.

    Konvensjon (som i appen): skjerm-y peker ned.
      t = (cos a, -sin a), n = (-t_y, t_x)
    """

    icon_rect = _icon_rect_for_button(rect)
    size = icon_rect.w
 
    # Tegn direkte i en temp-surface på ikonstørrelsen
    icon = pygame.Surface((size, size), pygame.SRCALPHA)

    # Bakgrunn i ikonfeltet (samme look som "tomt" ikon)
    if bg is not None:
        # fyll opakt, så ikonet matcher panelbakgrunn
        icon.fill(bg if len(bg) == 3 else (*bg[:3], 255))

    # Farge
    grid_col = (150, 150, 150) if disabled else color

    # Indre margin for å ikke kollidere med ikonramma
    inset = 4
    eff = size - 2 * inset
    cx, cy = size / 2.0, size / 2.0

    # Velg cellestørrelse litt mindre enn tidligere for å sikre "utstikk" innenfor
    # 2x2 ruter -> 3 linjer per retning. Med utstikk = cell/2 får total halv-lengde = cell + ext = 1.5*cell.
    # Sett cell slik at 1.5*cell < eff/2 ⇒ cell < eff/3. Vi holder oss litt under:
    cell = eff / 3.2
    ext  = cell / 2.0
    span = cell + ext  # halv lengde på linjene

    # Basis (tangent/normal) for gitt vinkel; skjerm-y ned → ty = -sin(a)
    a  = math.radians(rotate_deg)
    tx, ty = math.cos(a), -math.sin(a)
    nx, ny = -ty, tx

    # Hjelpere
    def draw_line(p0, p1):
        pygame.draw.line(icon, grid_col, p0, p1, 2)

    def add(p, q):  return (p[0] + q[0], p[1] + q[1])
    def mul(u, s):  return (u[0] * s, u[1] * s)

    center = (cx, cy)

    # Tre linjer PARALLELLE med t, offset langs n: n = -cell, 0, +cell
    for k in (-1, 0, +1):
        base = add(center, mul((nx, ny), k * cell))
        p0   = add(base, mul((tx, ty), -span))
        p1   = add(base, mul((tx, ty), +span))
        draw_line(p0, p1)

    # Tre linjer PARALLELLE med n, offset langs t: t = -cell, 0, +cell
    for k in (-1, 0, +1):
        base = add(center, mul((tx, ty), k * cell))
        p0   = add(base, mul((nx, ny), -span))
        p1   = add(base, mul((nx, ny), +span))
        draw_line(p0, p1)

    # Blit inn i knappen – IKKE roter temp; ikonet skal stå rett
    temp_rect = icon.get_rect(center=icon_rect.center)
    surf.blit(icon, temp_rect)

import math
import pygame

try:
    from pygame import gfxdraw
    HAS_GFX = True
except Exception:
    HAS_GFX = False


def draw_annular_arc(
    surface,
    center,                 # (cx, cy)
    r_inner, r_outer,       # inner/outer radii (pixels)
    start_angle, end_angle, # radians, CCW (like pygame.draw.arc)
    fill_color,
    border_color,
    border_width=1,
    aa=True,                # antialias with gfxdraw if available
    segments=128            # curve resolution
):
    cx, cy = center
    if r_outer <= 0 or r_inner < 0 or r_outer <= r_inner:
        return  # nothing to draw / invalid

    # normalize angles
    a1, a2 = (start_angle, end_angle)
    if a2 < a1:
        a1, a2 = a2, a1
    span = max(1e-6, a2 - a1)

    n = max(2, int(segments * span / (2 * math.pi)))
    step = span / n

    # Build polygon around the ring sector:
    outer = [
        (cx + r_outer * math.cos(a1 + i * step),
         cy + r_outer * math.sin(a1 + i * step))
        for i in range(n + 1)
    ]
    inner = [
        (cx + r_inner * math.cos(a2 - i * step),
         cy + r_inner * math.sin(a2 - i * step))
        for i in range(n + 1)
    ]
    poly = outer + inner

    if aa and HAS_GFX:
        pts = [(int(round(x)), int(round(y))) for x, y in poly]
        gfxdraw.filled_polygon(surface, pts, fill_color)
        gfxdraw.aapolygon(surface, pts, fill_color)  # clean edge
    else:
        pygame.draw.polygon(surface, fill_color, poly)

    # Draw border: outer/inner arcs + the two radial edges.
    rect_outer = pygame.Rect(cx - r_outer, cy - r_outer, 2 * r_outer, 2 * r_outer)
    rect_inner = pygame.Rect(cx - r_inner, cy - r_inner, 2 * r_inner, 2 * r_inner)
    pygame.draw.arc(surface, border_color, rect_outer, a1, a2, border_width)
    pygame.draw.arc(surface, border_color, rect_inner, a1, a2, border_width)

    p1o = (cx + r_outer * math.cos(a1), cy + r_outer * math.sin(a1))
    p1i = (cx + r_inner * math.cos(a1), cy + r_inner * math.sin(a1))
    p2o = (cx + r_outer * math.cos(a2), cy + r_outer * math.sin(a2))
    p2i = (cx + r_inner * math.cos(a2), cy + r_inner * math.sin(a2))
    pygame.draw.line(surface, border_color, p1i, p1o, border_width)
    pygame.draw.line(surface, border_color, p2i, p2o, border_width)


def draw_snap_icon(surf: pygame.Surface, rect: pygame.Rect, bg=None, color=None, disabled: bool = False):
    icon_rect = _icon_rect_for_button(rect)
    size = icon_rect.w

    icon = pygame.Surface((size, size), pygame.SRCALPHA)

    if bg is not None:
        icon.fill(bg if len(bg) == 3 else (*bg[:3], 255))

    col = color or TEXT_COLOR
    if disabled:
        col = (150, 150, 150)
    size = min(rect.width, rect.height)

    # Koordinatsystem for ikonet
    cx, cy = size * 0.5, size * 0.5   # magnet-tyngdepunkt i øvre venstre kvadrant
    outer_r = size * 0.35
    inner_r = size * 0.28
    thick   = max(2, int(outer_r - inner_r))

    # Halvsirkel (åpen mot punktet)
    # Vi tegner 180° bue (45°..+135°)
    start_a = math.radians(45)
    end_a   = math.radians(135)
    draw_annular_arc(
        icon,
        center=(cx, cy),
        r_inner=inner_r,
        r_outer=outer_r,
        start_angle=start_a,
        end_angle=end_a,
        fill_color=(255,0,0),
        border_color=(25,0,0),
        border_width=1,
        aa=True,
        segments=64
    )

    # Svart punkt i nedre venstre hjørne – diameter = inner_r*2
    # Plasser i nedre-venstre kvadrant langs diagonalen
    dl = pygame.Vector2(size*(1-0.72), size*(1-0.72))  # heuristisk posisjon
    dot_d = int(inner_r * 2)
    dot_d = max(4, min(dot_d, size//4))
    pygame.draw.circle(icon, (0,0,0),(int(dl.x - dot_d/2), int(dl.y - dot_d/2)) , dot_d//2)

    surf.blit(icon, icon.get_rect(center=rect.center))

# Felles helper for å lage en transparent ikon-surface i riktig størrelse
def _mk_icon_surface(rect: pygame.Rect) -> pygame.Surface:
    return pygame.Surface((rect.w, rect.h), pygame.SRCALPHA, 32).convert_alpha()

def draw_reset_icon(surf: pygame.Surface, rect: pygame.Rect, *, color=(230,30,30), bg=None):
    """
    Tegner en 'reset/refresh' sirkelpil (↻) skalert til rect.
    Blitter resultatet inn i surf ved rect.topleft.
    """
    icon = _mk_icon_surface(rect)
    w, h = rect.w, rect.h
    size = min(w, h)
    pad = max(2, int(size * 0.14))        # konsistent indre margin
    stroke = max(2, int(size * 0.10))     # linjetykkelse 

    # Arc-geometri (sirkelbue med hull til pilhode)
    cx, cy = size // 2, size // 2
    r = (size // 2) - pad
    arc_rect = pygame.Rect(0, 0, 2 * r, 2 * r)
    arc_rect.center = (cx, cy)

    # Tegn ~300° av en sirkel så det er plass til pilhodet
    start_angle = math.radians(40)        # 40°
    end_angle   = math.radians(360 - 20)  # 340°
    pygame.draw.arc(icon, color, arc_rect, start_angle, end_angle, stroke)

    # Pilhode i enden av buen (ved end_angle)
    ax = cx + r * math.cos(end_angle)
    ay = cy + r * math.sin(end_angle)
    # Retningsvektor langs tangenten til sirkelen i enden
    tx = -math.sin(end_angle)
    ty =  math.cos(end_angle)

    head_len = max(6, int(size * 0.22))
    head_w   = max(4, int(stroke * 1.2))

    # Trekant for pilhode: spiss i (ax, ay), to basespunkter bakover langs -tangent ± normal
    bx = ax - tx * head_len
    by = ay - ty * head_len
    nx, ny = -ty, tx  # normal

    p1 = (ax, ay)
    p2 = (bx + nx * head_w * 0.5, by + ny * head_w * 0.5)
    p3 = (bx - nx * head_w * 0.5, by - ny * head_w * 0.5)
    pygame.draw.polygon(icon, color, (p1, p2, p3))

    # Blit til målflate
    surf.blit(icon, rect.topleft)


def draw_check_icon(surf: pygame.Surface, rect: pygame.Rect, *, color=(30,30,30), bg=None):
    """
    Tegner en enkel, tydelig 'check' (✓) skalert til rect.
    Blitter resultatet inn i surf ved rect.topleft.
    """
    icon = _mk_icon_surface(rect)
    w, h = rect.w, rect.h
    size = min(w, h)
    pad = max(2, int(size * 0.18))        # litt mer padding for å unngå clipping i hjørner
    stroke = max(2, int(size * 0.12))     # litt tykkere for god lesbarhet

    # Tre kontrollpunkter som gir en proporsjonal, balansert hake
    # pA: start (venstre-ned), pB: knekk, pC: slutt (høyre-opp)
    pA = (pad,                h - pad - int(size * 0.18))
    pB = (pad + int(size*0.30), h - pad)
    pC = (w - pad,            pad)

    # Hake tegnes som to linjer for skarp knekk; pygame håndterer width fint
    pygame.draw.line(icon, color, pA, pB, stroke)
    pygame.draw.line(icon, color, pB, pC, stroke)

    # Valgfritt (deaktiver hvis du vil ha «bare hake»):
    # Tegn en subtil «optisk» endecap ved å fylle små sirkler i endene for glattere caps
    cap_r = max(1, stroke // 2)
    pygame.draw.circle(icon, color, pA, cap_r)
    pygame.draw.circle(icon, color, pB, cap_r)
    pygame.draw.circle(icon, color, pC, cap_r)

    # Blit til målflate
    surf.blit(icon, rect.topleft)
