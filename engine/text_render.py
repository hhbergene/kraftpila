# text_render.py
import pygame

# Enkle justeringer – finjuster ved behov
SUBSCALE = 0.8       # skaleringsfaktor for sub/sup
DY_FACTOR = 0.50     # hvor mye baseline flyttes (andel av font-høyde)

def _is_normal_char(ch: str) -> bool:
    # Hva som kvalifiserer som "normalt tegn" for å starte sub/sup
    return ch.isalnum() or ch in (")",)

def render_text(text: str, font: pygame.font.Font, antialias: bool, color, subsurface_bg=None) -> pygame.Surface:
    """
    Tolk '_' og '^' slik:
      - '_X' eller '^X' gir X som subscript/superscript
      - '_{ABC}' eller '^{ABC}' gir ABC som subscript/superscript
      - Første mellomrom eller andre tegn avslutter subscript/superscript (tilbake til normal)
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
    mode_single_char = False # True hvis mode gjelder bare ett tegn (ikke innenfor {})

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

        # Håndter kontrolltegn for sub/sup
        if ch in ("_", "^"):
            mode = "sub" if ch == "_" else "sup"
            i += 1
            
            # Sjekk hva som kommer etter
            if i < len(text) and text[i] == "{":
                # Braces-mode: fortsett subscript/superscript til vi finner }
                mode_single_char = False
                i += 1  # skip {
                continue
            else:
                # Single-char mode: bare neste tegn er subscript/superscript
                mode_single_char = True
                continue

        # Skip invisible braces (bare ved multi-char mode)
        if ch == "{":
            i += 1
            continue
        
        if ch == "}":
            # Avslutter multi-char subscript/superscript
            mode = "normal"
            mode_single_char = False
            i += 1
            continue

        # Space avslutter subscript/superscript
        if ch == " ":
            mode = "normal"
            mode_single_char = False
            s, adv, yoff = render_char(ch, "normal")
            glyphs.append((s, adv, yoff))
            i += 1
            continue

        # Vanlig tegn
        s, adv, yoff = render_char(ch, mode)
        glyphs.append((s, adv, yoff))
        
        # Hvis single-char mode, reset etter tegn
        if mode_single_char:
            mode = "normal"
            mode_single_char = False
        
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
