# ui/layout.py
import pygame
from ui.buttons import Button, draw_grid_icon, draw_arrow_icon, draw_reset_icon, draw_check_icon
from utils.settings import (
    WIDTH, TEXT_COLOR, BG_COLOR, GRID_COLOR, BUTTON_ON, BUTTON_OFF,
    BUTTON_ARROW, BUTTON_ARROW_BG, get_font, get_font_stack,
    LEFT_X, TOP_Y, BTN_W, BTN_H, BTN_GAP, TITLE_Y, TITLE_SIZE
)

class ButtonPanel:
    """
    Venstrepanel m/ knapper.
    De tidligere "Rutenett" og "Rutenettype" er erstattet av TRE kvadratiske ikonknapper:
      - Grid OFF  (tomt ikon)
      - Grid XY   (normalt rutenett)
      - Grid NP   (rutenett rotert med planet) — skjules når vinkel = 0.
    """
    def __init__(self, on_prev, on_help, on_next,
                 on_snap, on_guidelines, on_grid_off, on_grid_xy,
                 on_reset, on_check):
        # Lagre referanser
        self.cb_prev = on_prev
        self.cb_next = on_next
        self.cb_help = on_help
        self.cb_snap = on_snap
        self.cb_guidelines = on_guidelines
        self.cb_grid_off = on_grid_off
        self.cb_grid_xy  = on_grid_xy
        self.cb_reset = on_reset
        self.cb_check = on_check

        y = TOP_Y
        size = BTN_H
        gap  = 6
        
        # Små toppknapper (ikon-only)
        x = WIDTH // 4
        self.btn_prev = Button(x, y, size, size, "", on_prev,icon="⬅")
        x += size + gap
        self.btn_help = Button(x, y, size*4, size, "Oppgave 1", on_help,icon="❓")
        x += size*4 + gap
        self.btn_next = Button(x, y, size, size, "", on_next,icon="➡")

        x += size + gap
        self.btn_check = Button(x, y, size*3, size, "Sjekk", on_check, icon="✅")
    
        x += size*3 + gap
        y= TOP_Y
        self.btn_reset = Button(x, y, size*3, size, "Reset", on_reset, icon="🔄")
 
    
        y= TOP_Y
        x = LEFT_X
        #y+= size + BTN_GAP
        # Rad: Snapp + guidelines + to kvadratiske grid-knapper
        self.btn_snap      = Button(LEFT_X, y, size, size, "", on_snap, icon="🧲")
        self.btn_guidelines = Button(LEFT_X + (size+gap)*1, y, size, size, "", on_guidelines, icon="📐")
        self.btn_grid_off  = Button(LEFT_X + (size+gap)*2, y, size, size, "", on_grid_off)
        self.btn_grid_xy   = Button(LEFT_X + (size+gap)*3, y, size, size, "", on_grid_xy)

    
        self.buttons = [
            self.btn_prev, self.btn_help, self.btn_next,
            self.btn_snap, self.btn_guidelines, self.btn_grid_off, self.btn_grid_xy,
            self.btn_reset, self.btn_check
        ]
        # Tittel
        self._title_font = get_font(TITLE_SIZE)
        self._small_font = get_font_stack("math",18)
        self.plane_angle = 0.0

    def draw_buttons(self, screen, *, snap_on: bool, guidelines_on: bool, grid_on: bool, plane_angle: float):
        self.plane_angle = plane_angle
        
        # Topp: tegn “← ? →”
        for b in (self.btn_prev, self.btn_help, self.btn_next):
            b.draw(screen, on=False)
        # ikonene (vektor)
        #draw_arrow_icon(screen, self.btn_prev_top.rect, direction="left",  bg=BUTTON_ARROW_BG, color=BUTTON_ARROW)
        # "?" ikon i midterste topp-knapp
        #pygame.draw.circle(screen, (245,245,245), self.btn_help_top.rect.center, self.btn_help_top.rect.w//2 - 1)
        #pygame.draw.circle(screen, (90,90,90),   self.btn_help_top.rect.center, self.btn_help_top.rect.w//2 - 1, 2)
        #q = get_font(18).render("?", True, TEXT_COLOR)
        #screen.blit(q, q.get_rect(center=self.btn_help_top.rect.center))
        #draw_arrow_icon(screen, self.btn_next_top.rect, direction="right", bg=BUTTON_ARROW_BG, color=BUTTON_ARROW)

        # Rad: Snapp + grids (samme linje)
        # Snapp
        self.btn_snap.draw(screen, on=snap_on)
        #from ui.buttons import draw_snap_icon
        #draw_snap_icon(screen, self.btn_snap.rect)

        # Guidelines
        self.btn_guidelines.draw(screen, on=guidelines_on)

        # Grid OFF
        self.btn_grid_off.draw(screen, on=False)
        draw_grid_icon(screen, self.btn_grid_off.rect, color=BG_COLOR, bg=BG_COLOR)
        if not grid_on:
            pygame.draw.rect(screen, (80,160,80), self.btn_grid_off.rect, 2, border_radius=6)

        # Grid XY
        self.btn_grid_xy.draw(screen, on=False)
        draw_grid_icon(screen, self.btn_grid_xy.rect, color=GRID_COLOR, bg=BG_COLOR, rotate_deg=0.0)
        if grid_on:
            pygame.draw.rect(screen, (80,160,80), self.btn_grid_xy.rect, 2, border_radius=6)
        
        self.btn_reset.draw(screen, on=False)
        #draw_reset_icon(screen, self.btn_reset.rect)
        self.btn_check.draw(screen, on=False)
        #draw_check_icon(screen, self.btn_check.rect, color=BG_COLOR, bg=BG_COLOR)


    def handle_event(self, e):
        for b in self.buttons:
            if b.handle_event(e):
                return True
        return False

    def draw_title(self, screen, text: str, short_lines: list[str] | None = None):
        # Oppgavetekst kort
        if short_lines:
            y = TOP_Y + BTN_H + BTN_GAP
            for line in short_lines[:3]:
                line_surf = self._small_font.render(line, True, TEXT_COLOR)
                line_rect = line_surf.get_rect(midleft=(WIDTH // 4, y + line_surf.get_height() // 2))
                screen.blit(line_surf, line_rect)
                y = line_rect.bottom + 2

def make_panel(on_prev, on_help, on_next, on_snap, on_guidelines,
               on_grid_off, on_grid_xy, 
               on_reset, on_check) -> ButtonPanel:
    return ButtonPanel(on_prev, on_help, on_next, 
                       on_snap, on_guidelines, on_grid_off, on_grid_xy,
                       on_reset, on_check)
