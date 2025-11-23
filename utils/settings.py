# utils/settings.py
WIDTH, HEIGHT = 1000, 640
GRID_STEP = 20
CENTER_X, CENTER_Y = WIDTH // 2, HEIGHT // 2
PICKING_DISTANCE_THRESHOLD = GRID_STEP #Minimum lik GRID_STEP, ellers blir highligting rar
HANDLE_RADIUS = 4
MIN_LEN = GRID_STEP
HIT_LINE_TH = 8

BG_COLOR = (240,240,240)
BLOCK_COLOR = (160,200,255)
FORCE_COLOR = (255,80,80)
ACTIVE_FORCE_COLOR = (255,80,80)
HIGHLIGHT_FORCE_COLOR = (255, 125, 0)
ACTIVE_FORCE_HANDLE_COLOR = (255,80,80)
HIGHLIGHT_FORCE_HANDLE_COLOR = (0, 0, 0)
TEXT_COLOR = (0,0,0)
ACTIVE_BG = (190,230,190)
INACTIVE_BG = (255,255,255)
BUTTON_ON = (120,220,120)
BUTTON_OFF = (210,210,210)
BUTTON_ARROW = (255,255,10)
BUTTON_ARROW_BG = (10,10,180)
GRID_COLOR = (220, 220, 220)

# Overlay feedback colors and alpha values
OVERLAY_COLOR_OK = (80, 200, 80)
OVERLAY_COLOR_SPAN = (220, 60, 60)
OVERLAY_ALPHA_OK = 90
OVERLAY_ALPHA_SPAN = 30

# Guidelines (reference lines during drawing/dragging)
GUIDELINES_COLOR = (180, 180, 180)      # Slightly darker than grid for visibility
GUIDELINES_WIDTH = 1                     # Dotted line width
GUIDELINES_DASH_SIZE = 4                 # Pixels per dash segment
GUIDELINES_ON_DEFAULT = False            # Guidelines off by default

# App state defaults
SNAP_ON_DEFAULT = False
GRID_ON_DEFAULT = True

# Scene rendering
SCENE_ALPHA = 0.5  # alpha (transparency) for fill colors in scene objects

# --- Task geometry constants ---
# Senterpunkt for tegning av oppgaver (brukes i problem/tasks.py)
DRAW_CENTER = (CENTER_X - GRID_STEP*6, CENTER_Y + GRID_STEP * 8)

# Right-hand panel (tekstbokser for krefter)
TEXTBOX_FIRST_Y = 68
TEXTBOX_GAP = 42
RIGHT_PANEL_W = 100
RIGHT_PANEL_X = WIDTH - RIGHT_PANEL_W - TEXTBOX_GAP
RIGHT_LABEL_Y = 40
RIGHT_LABEL_FONT_SIZE = 22
TEXTBOX_H = 30
TEXTBOX_FONT_SIZE = 20

# --- Force drawing boundary limits ---
# Defines the allowed area for drawing and editing forces to prevent interaction with UI elements
# (left, top, right, bottom) in screen coordinates
# Prevents drawing over buttons (left), textboxes (right), and ensures clean UI separation
FORCE_DRAW_LIMIT_LEFT   = 250      # Left boundary (prevents overlap with panel buttons)
FORCE_DRAW_LIMIT_TOP    = 80       # Top boundary (below button row)
FORCE_DRAW_LIMIT_RIGHT  = RIGHT_PANEL_X      # Right boundary (prevents overlap with right textbox panel)
FORCE_DRAW_LIMIT_BOTTOM = HEIGHT   # Bottom boundary (full height)

# --- Direction unit vectors (for force specifications) ---
# In pygame coordinates: y-axis points DOWN (not up like in math)
# So: UP = (0, -1), DOWN = (0, +1), LEFT = (-1, 0), RIGHT = (+1, 0)
UP    = (0.0, -1.0)      # y decreases (screen: up)
DOWN  = (0.0, +1.0)      # y increases (screen: down)
LEFT  = (-1.0, 0.0)      # x decreases (screen: left)
RIGHT = (+1.0, 0.0)      # x increases (screen: right)

import pygame

pygame.font.init()

# Enkel cache så vi slipper å opprette nye font-objekter hele tiden
_FONTS: dict[tuple[str, int], pygame.font.Font] = {}

def get_font(size: int = 20, name: str | None = None) -> pygame.font.Font:
    key = ((name or "arial").lower(), int(size))
    if key not in _FONTS:
        _FONTS[key] = pygame.font.SysFont(key[0], key[1])
    return _FONTS[key]

# utils/settings.py (legg til nederst, etter eksisterende get_font)

# --- Font stacks for ulike bruksområder ---
FONT_STACKS = {
    "ui": [
        "Segoe UI", "Arial", "DejaVu Sans", "Noto Sans"
    ],
    "icons": [  # emoji/symboler for knapper
        "Segoe UI Emoji", "Segoe UI Symbol", "Noto Emoji", "Twemoji Mozilla", "Apple Color Emoji"
    ],
    "math": [  # Cambria for fysikk/matte
        "Cambria Math","Cambria", "Times New Roman", "DejaVu Serif", "Noto Serif", "Arial Unicode MS"
    ],
}

# intern cache for fontstacks
_FONTSTACK_CACHE: dict[tuple[str, int], pygame.font.Font] = {}

def get_font_stack(category_or_name: str, size: int = 20) -> pygame.font.Font:
    """
    Hent en pygame.font.Font fra en navngitt kategori ("icons", "math", "ui")
    eller et spesifikt fontnavn. Prøver fallback-liste. Caches pr (key,size).
    """
    key = (category_or_name.lower(), int(size))
    if key in _FONTSTACK_CACHE:
        return _FONTSTACK_CACHE[key]

    # velg kandidatnavn
    candidates = FONT_STACKS.get(category_or_name.lower(), [category_or_name])

    # forsøk: match_font → Font(path, size), ellers SysFont(name, size)
    for name in candidates:
        try:
            path = pygame.font.match_font(name)
            if path:
                f = pygame.font.Font(path, int(size))
                _FONTSTACK_CACHE[key] = f
                return f
            # fallback til SysFont hvis match_font ikke ga path
            f = pygame.font.SysFont(name, int(size))
            if f:
                _FONTSTACK_CACHE[key] = f
                return f
        except Exception:
            continue

    # siste utvei: default pygame font
    f = pygame.font.SysFont(None, int(size))
    _FONTSTACK_CACHE[key] = f
    return f


# -----------------------------
# UI / layout constants (moved from ui/layout.py)
# -----------------------------
# Panel placement (left/top) and button sizing
LEFT_X   = 20
TOP_Y    = 20
BTN_W    = 180
BTN_H    = 36
BTN_GAP  = 10

# Title area inside left panel
TITLE_Y    = 24
TITLE_SIZE = 28


# Helper function to check if a point is within the force drawing boundary
def is_within_force_draw_limits(pos: tuple[float, float]) -> bool:
    """
    Check if a position (x, y) is within the allowed force drawing area.
    Returns True if point is inside the boundary, False otherwise.
    
    Prevents drawing forces over UI elements (buttons on left, textboxes on right).
    """
    x, y = pos
    return (FORCE_DRAW_LIMIT_LEFT <= x <= FORCE_DRAW_LIMIT_RIGHT and
            FORCE_DRAW_LIMIT_TOP <= y <= FORCE_DRAW_LIMIT_BOTTOM)


def clamp_to_force_draw_limits(pos: tuple[float, float]) -> tuple[float, float]:
    """
    Clamp a position to the allowed force drawing area.
    Returns the clamped position ensuring it stays within drawing boundaries.
    """
    x, y = pos
    x_clamped = max(FORCE_DRAW_LIMIT_LEFT, min(x, FORCE_DRAW_LIMIT_RIGHT))
    y_clamped = max(FORCE_DRAW_LIMIT_TOP, min(y, FORCE_DRAW_LIMIT_BOTTOM))
    return (x_clamped, y_clamped)
