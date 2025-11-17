# text_render.py
import pygame

# Enkle justeringer – finjuster ved behov
SUBSCALE = 0.8       # skaleringsfaktor for sub/sup
DY_FACTOR = 0.30     # hvor mye baseline flyttes (andel av font-høyde)

def _is_normal_char(ch: str) -> bool:
    # Hva som kvalifiserer som "normalt tegn" for å starte sub/sup
    return ch.isalnum() or ch in (")",)

def render_text(text: str, font: pygame.font.Font, antialias: bool, color, subsurface_bg=None) -> pygame.Surface:
    """
    Tolk '_' og '^' slik:
      - '_' eller '^' etter et normalt tegn starter sub/sup **fra neste tegn**
      - Første mellomrom avslutter sub/sup (tilbake til normal)
      - '_'/'^' ellers vises som vanlige tegn
    Returnerer en ferdig Surface som kan blit'es.
    """
    height = font.get_height()
    sub_dy = int(DY_FACTOR * height)         # ned for sub
    sup_dy = -int(DY_FACTOR * height)        # opp for sup
    top_extra = max(0, -sup_dy)              # plass over baseline (for sup)
    bottom_extra = max(0, sub_dy)            # plass under baseline (for sub)

    # Total høyde for output-surface
    out_h = height + top_extra + bottom_extra
    # Vi vet ikke bredde på forhånd – bygg glyphs først
    glyphs = []  # (surface, x_advance, y_offset)

    mode = "normal"          # 'normal' | 'sub' | 'sup'

    # Liten helper for å rendre ett tegn i valgt modus
    def render_char(ch: str, mode_now: str):
        s = font.render(ch, antialias, color)
        # Skaler for sub/sup
        if mode_now in ("sub", "sup"):
            w, h = s.get_size()
            s = pygame.transform.smoothscale(s, (max(1, int(w * SUBSCALE)), max(1, int(h * SUBSCALE))))
        # y-offset
        yoff = 0
        if mode_now == "sub":
            yoff = sub_dy
        elif mode_now == "sup":
            yoff = sup_dy
        return s, s.get_width(), yoff

    i = 0
    while i < len(text):
        ch = text[i]

        # Skip invisible braces
        if ch in ("{", "}"):
            if ch == "}":
                mode = "normal"
            i += 1
            continue

        # Håndter kontrolltegn for sub/sup
        if ch in ("_", "^"):
            mode = "sub" if ch == "_" else "sup"
            # Ikke legg inn selve kontrolltegnet
            i += 1
            continue

        # Vanlig tegn
        s, adv, yoff = render_char(ch, mode)
        glyphs.append((s, adv, yoff))
        i += 1

    # Lag output-surface og blit sekvensielt
    total_w = sum(adv for _, adv, _ in glyphs)
    out = pygame.Surface((max(1, total_w), max(1, out_h)), pygame.SRCALPHA)
    x = 0
    for s, adv, yoff in glyphs:
        if s is not None:
            # baseline i out er på y = top_extra
            out.blit(s, (x, top_extra + yoff))
        x += adv

    return out
