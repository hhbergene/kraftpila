# engine/forces.py
import math
import pygame
import warnings

import utils.geometry as vec
from utils.settings import (
    MIN_LEN, HANDLE_RADIUS, FORCE_COLOR,ACTIVE_FORCE_COLOR, ACTIVE_FORCE_HANDLE_COLOR, HIGHLIGHT_FORCE_HANDLE_COLOR, HIGHLIGHT_FORCE_COLOR, GRID_STEP, TEXT_COLOR,
    GUIDELINES_COLOR, GUIDELINES_WIDTH, GUIDELINES_DASH_SIZE, CENTER_X, CENTER_Y, 
    is_within_force_draw_limits, clamp_to_force_draw_limits
)
from utils.settings import get_font
from engine.snapping import snap_point
from engine.render import draw_dotted_line
from engine.text_render import render_text

def normalize_name(s: str) -> str:
    """
    Normaliser navn for matching: trim, lower, fjern mellomrom, underscore, caret og braces.
    
    Brukt for:
    - Kraftnavn-matching (case-insensitive, ignorer subscript/superscript syntax)
    - Alias-matching
    
    Eksempler:
      "G_x" -> "gx"
      "Force N" -> "forcen"
      "F^{2}" -> "f2"
    """
    if not s:
        return ""
    s = s.strip().lower()
    remove = {" ", "_", "^", "{", "}"}
    return "".join(ch for ch in s if ch not in remove)

class Force:
    """
    En kraft definert av:
      - anchor: angrepspunkt (hvor kraften virker, vises liten sirkel)
      - arrowBase: basispunkt for pila (usynlig, men referansepunkt)
      - arrowTip: endepunkt på pila (hvor pila peker, vises som redigeringspunkt i redigering)

    Tilstander:
      - drawing: vi tegner ny kraft (anchor/arrowBase finnes, arrowTip følger mus)
      - dragging: "anchor" | "arrowTip" | "body" (dra på pila → parallellforskyvning)
    """

    def __init__(self):
        # Geometri
        self.anchor = None
        self.arrowTip = None
        self.arrowBase = None

        # Interaksjon
        self.drawing = False        # True om vi er i gang med å tegne ny kraft
        self.dragging = None        # None, "anchor", "arrowTip", "body"
        self.hovering = None        # None, "anchor", "arrowTip", "body" (mus nær, ingen dra)
        self.drag_offset = (0, 0)   # brukes for "body"

        # Kraft (arrowBase -> arrowTip)
        self.force_dir = (1.0, 0.0)
        self.force_len = 0.0

        # Navn på kraft (kobles til tekstboks)
        self.name = ""

        # Redigerbarhet
        self.editable = True         # kan dra A (endre angrepspunkt)
        self.moveable = True         # kan dra B eller "body" (endre pila/lengde)

    # ------------------ Tegning ------------------
    def draw(self, surf, active=False):
        """Tegn hjelpe-linjen anchor-arrowBase, kraftpilen arrowBase→arrowTip, redigeringspunkt - og navn ved pila."""

        # 1) Punkter (anchor/arrowTip-redigeringspunkt)
        # anchor-redigeringspunkt:
        if self.editable and self.anchor:
            # Highlight anchor if dragging it
            if self.dragging == "anchor" or self.hovering == "anchor":
                handle_color_bg = HIGHLIGHT_FORCE_HANDLE_COLOR
                #handle_color_fg = ACTIVE_FORCE_HANDLE_COLOR
                pygame.draw.circle(surf, handle_color_bg, self.anchor, HANDLE_RADIUS)
                #pygame.draw.circle(surf, handle_color_bg, self.anchor, HANDLE_RADIUS, width=2)
            elif active:
                handle_color = ACTIVE_FORCE_HANDLE_COLOR 
                pygame.draw.circle(surf, handle_color, self.anchor, HANDLE_RADIUS)

        # arrowTip-redigeringspunkt:
        if self.editable and self.arrowTip:
            if self.dragging == "arrowTip" or self.hovering == "arrowTip":
                handle_color_bg = HIGHLIGHT_FORCE_HANDLE_COLOR
                #handle_color_fg = ACTIVE_FORCE_HANDLE_COLOR
                pygame.draw.circle(surf, handle_color_bg, self.arrowTip, HANDLE_RADIUS)
                #pygame.draw.circle(surf, handle_color_bg, self.arrowTip, HANDLE_RADIUS, width=2)
            elif active:
                handle_color = ACTIVE_FORCE_HANDLE_COLOR 
                handle_radius = HANDLE_RADIUS
                pygame.draw.circle(surf, handle_color, self.arrowTip, handle_radius)

        # 2) Linje + pil
        if self.anchor and self.arrowTip and self.arrowBase and  self.force_len >= 1e-3:
            # hjelpelinje anchor-arrowBase
            force_color = ACTIVE_FORCE_COLOR if active else FORCE_COLOR
            pygame.draw.line(surf, force_color, self.anchor, self.arrowBase, width=2)

            # Beregn pilspiss-geometri og
            # forkort body slik at den ikke stikker ut på enden
            dx, dy = self.arrowTip[0] - self.arrowBase[0], self.arrowTip[1] - self.arrowBase[1]
            ang = math.atan2(dy, dx)
            ARROW_HEAD_LENGTH = 12
            a = math.pi / 6 # 30 grader
            arrow_head_left  = (self.arrowTip[0] - ARROW_HEAD_LENGTH * math.cos(ang - a), self.arrowTip[1] - ARROW_HEAD_LENGTH * math.sin(ang - a))
            arrow_head_right = (self.arrowTip[0] - ARROW_HEAD_LENGTH * math.cos(ang + a), self.arrowTip[1] - ARROW_HEAD_LENGTH * math.sin(ang + a))
            arrow_head_tip_fg = (self.arrowTip[0] + 2 * math.cos(ang), self.arrowTip[1] + 2 * math.sin(ang)) 
            arrow_head_left_fg  = (arrow_head_tip_fg[0] - (ARROW_HEAD_LENGTH+2) * math.cos(ang - a), arrow_head_tip_fg[1] - (ARROW_HEAD_LENGTH+2) * math.sin(ang - a))
            arrow_head_right_fg = (arrow_head_tip_fg[0] - (ARROW_HEAD_LENGTH+2) * math.cos(ang + a), arrow_head_tip_fg[1] - (ARROW_HEAD_LENGTH+2) * math.sin(ang + a))
            arrow_length = self.force_len
            margin = ARROW_HEAD_LENGTH-2
            t_end = 1.0 - (margin / arrow_length)
          
            body_start = self.arrowBase
            body_end = (self.arrowBase[0] + dx * t_end, self.arrowBase[1] + dy * t_end)
        

            # pil arrowBase→arrowTip
            # Bestem farge og bredde basert på state
            if self.dragging == "body" or self.hovering == "body":
                # Dra body: vis som tofarget pil (highlight bakgrunn + aktiv forgrunn)
                arrow_color_bg = HIGHLIGHT_FORCE_COLOR
                arrow_color_fg = ACTIVE_FORCE_COLOR
                pygame.draw.polygon(surf, arrow_color_fg, [self.arrowTip, arrow_head_left, arrow_head_right])
                pygame.draw.line(surf, arrow_color_bg, body_start, body_end, 6)
                pygame.draw.line(surf, arrow_color_fg, body_start, body_end, 4)
            elif self.dragging == "arrowTip" or self.hovering == "arrowTip":
                arrow_color_bg = HIGHLIGHT_FORCE_COLOR
                arrow_color_fg = ACTIVE_FORCE_COLOR
                pygame.draw.polygon(surf, arrow_color_bg, [arrow_head_tip_fg, arrow_head_left_fg, arrow_head_right_fg], width=4)
                pygame.draw.polygon(surf, arrow_color_fg, [self.arrowTip, arrow_head_left, arrow_head_right])
                pygame.draw.line(surf, arrow_color_fg, body_start, body_end, 4)
            elif active and self.dragging == "anchor":
                arrow_color = HIGHLIGHT_FORCE_COLOR
                pygame.draw.polygon(surf, arrow_color, [self.arrowTip, arrow_head_left, arrow_head_right])
                pygame.draw.line(surf, arrow_color, body_start, body_end, 4)
            else:
                arrow_color = ACTIVE_FORCE_COLOR if active else FORCE_COLOR
                pygame.draw.polygon(surf, arrow_color, [self.arrowTip, arrow_head_left, arrow_head_right])
                pygame.draw.line(surf, arrow_color, body_start, body_end, 4)

        # 3) Navn ved pila – midt på linja, forskjøvet til "anchor-siden"
        if self.name and self.anchor and self.arrowTip and self.arrowBase:
            v = vec.sub(self.arrowTip, self.arrowBase)
            if vec.norm(v) > 1e-6:
                mid = ((self.arrowBase[0] + self.arrowTip[0]) * 0.5, (self.arrowBase[1] + self.arrowTip[1]) * 0.5)
                n =  vec.normalize(vec.perp(v))  # en av normalene
                side = (v[0] * (self.anchor[1] - mid[1]) - v[1] * (self.anchor[0] - mid[0]))  # cross2D(v, anchor-mid)

                SIDE_EPS = 0.75  # px – deadband for å unngå flikking nær linja
                if side > SIDE_EPS:
                    n = (-n[0], -n[1])
                # hvis -SIDE_EPS <= side <= SIDE_EPS: behold n uendret

                offset_len = 0.9 * GRID_STEP
                label_center = (mid[0] + n[0] * offset_len, mid[1] + n[1] * offset_len)

                font = get_font(18)
                surf_text = render_text(self.name, font, True, TEXT_COLOR)      
                rect = surf_text.get_rect(center=(int(label_center[0]), int(label_center[1])))
                surf.blit(surf_text, rect)

    def draw_guidelines(self, surf, mouse_pos, guidelines_on, shift_held, plane_angle_deg, WIDTH, HEIGHT):
        """
        Tegner referanselinjer (guidelines) gjennom muspekeren når man tegner/drar kraft.
        
        Linjer er parallelt med planet-aksen og går over hele skjermen.
        
        Args:
            surf: Pygame surface
            mouse_pos: Gjeldende museposisjon (x, y)
            guidelines_on: Boolean, om guidelines er aktivert via knapp
            shift_held: Boolean, om SHIFT-tast er holdt
            plane_angle_deg: Vinkel på planet i grader
            WIDTH: Skjermbredde
            HEIGHT: Skjermhøyde
        """
        # Ikke tegn guidelines hvis vi ikke tegner/drar kraft
        if not (self.drawing or self.dragging):
            return
        
        # Sjekk om guidelines skal vises: knapp-setting ELLER shift-held
        show_guidelines = guidelines_on or shift_held
        if not show_guidelines:
            return
        
        mx, my = mouse_pos
        
        # Beregn retninger parallelt og normalt på planet
        angle_rad = math.radians(plane_angle_deg)
        # Tangent langs planet (parallelt)
        tangent_x = math.cos(angle_rad)
        tangent_y = -math.sin(angle_rad)
        # Normal (vinkelrett)
        normal_x = tangent_y
        normal_y = -tangent_x
        
        # Tegn linje langs planet-tangent (gjennom muspeker)
        # Strekk linjen fra venstre til høyre kant
        t_min = -max(WIDTH, HEIGHT)
        t_max = max(WIDTH, HEIGHT)
        p1_tangent = (mx + t_min * tangent_x, my + t_min * tangent_y)
        p2_tangent = (mx + t_max * tangent_x, my + t_max * tangent_y)
        draw_dotted_line(surf, GUIDELINES_COLOR, p1_tangent, p2_tangent, 
                        width=GUIDELINES_WIDTH, dash_size=GUIDELINES_DASH_SIZE)
        
        # Tegn linje langs planet-normal (gjennom muspeker)
        # Strekk linjen fra topp til bunn
        p1_normal = (mx + t_min * normal_x, my + t_min * normal_y)
        p2_normal = (mx + t_max * normal_x, my + t_max * normal_y)
        draw_dotted_line(surf, GUIDELINES_COLOR, p1_normal, p2_normal,
                        width=GUIDELINES_WIDTH, dash_size=GUIDELINES_DASH_SIZE)

    @property
    def vec(self):
        """Retningsvektor arrowBase→arrowTip, eller None hvis ukjent/ufullstendig."""
        if self.arrowBase is None or self.arrowTip is None:
            return None
        return (self.arrowTip[0] - self.arrowBase[0], self.arrowTip[1] - self.arrowBase[1])

    @property
    def length(self) -> float:
        """Lengde på C→B (0.0 hvis ikke definert)."""
        v = self.vec
        if not v:
            return 0.0
        import math
        return math.hypot(v[0], v[1])

    def is_completed(self, min_len: float) -> bool:
        """
        Ferdigtegnet kraft med anchor, arrowTip, arrowBase satt og lengde ≥ min_len.
        """
        return (
            (not self.drawing) and
            (self.anchor is not None) and (self.arrowTip is not None) and (self.arrowBase is not None) and
            (self.length >= min_len)
        )

    def angle_to(self, target: tuple[float, float]) -> float:
        """
        Minste vinkel (grader) mellom kraftvektor og target.
        +inf hvis vektor mangler eller ~0.
        """
        import math
        v = self.vec
        if v is None:
            return float("inf")
        vx, vy = v
        nx = math.hypot(vx, vy)
        tx, ty = target
        nt = math.hypot(tx, ty)
        if nx < 1e-9 or nt < 1e-9:
            return float("inf")
        c = max(-1.0, min(1.0, (vx*tx + vy*ty)/(nx*nt)))
        return abs(math.degrees(math.acos(c)))

    def has_name(self, aliases: set[str]) -> bool:
        """Robust alias-sjekk: ignorer mellomrom/underscore/caret, case-insensitiv."""
        nm = normalize_name(getattr(self, "name", ""))
        return nm in {normalize_name(a) for a in aliases}
    
    # ------------------ Interaksjon ------------------
    def handle_mouse_down(self, pos, snap_pts,
                        angle_deg=0.0, step=GRID_STEP, SNAP_ON=True):
        """
        Starter ny kraft ved første klikk-og-dra (setter anchor og arrowBase), ellers velger redigeringspunkt:
        - Treffer anchor  -> dra anchor  (hele kraften parallellforskyves)
        - Treffer arrowTip  -> dra arrowTip  (endre retning/lengde)
        - Treffer linje arrowBase–arrowTip -> dra "body" (parallellforskyvning)
        Merk:
        - Når ny kraft startes snappes anchor til block_points først, deretter grid.
        - arrowTip settes ikke her; den følger mus i handle_motion (med snapping).
        - Tegning og anchor-redigering er begrenset til force drawing area.
        - arrowTip og arrowBase kan strekke seg UTENFOR boundaries (ingen grensebegrensning).
        """

        # Hvis kraft ikke er redigerbar/bevegelig, ignorer museklikk
        if not self.editable and not self.moveable:
            return

        # 1) Start ny kraft (anchor/arrowBase mangler) – kun innenfor tegningsområde
        if not self.anchor:
            # Må være redigerbar for å kunne starte ny kraft
            if not self.editable:
                print("WARNING: Force not editable; cannot start new force.")
                return
            
            # Check if click is within drawing boundaries
            if not is_within_force_draw_limits(pos):
                return

            # Snappe anchor til block_points eller grid
            origin = snap_pts[0] if snap_pts else (CENTER_X, CENTER_Y)  
            snapped_anchor = snap_point(
                pos, angle_deg, step, origin,
                snap_on=SNAP_ON,
                snap_points=snap_pts,
            )

            # Sett angrepspunkt og initier tegning
            self.anchor = snapped_anchor
            self.arrowBase = self.anchor
            self.drawing = True               
            return
        # End of 1) Start ny kraft

        # 2) Velg redigeringspunkt for redigering/forskyvning på eksisterende kraft
        #    Velg det punktet som har MINSTE avstand (innenfor hit-radius)
    
        if self.hovering:            
            self.dragging = self.hovering
            
            # Hvis "body"-drag, sett drag_offset for å holde "grep" på pila
            if self.dragging == "body":
                self.drag_offset = vec.sub(self.arrowBase, pos)
            
            return

        # Ikke truffet redigeringspunkt – ingen umiddelbar endring (motion kan håndtere tegning)
        return

    def handle_motion(self, pos, rel, snap_pts,
                    origin_scene=None, angle_deg=0.0, GRID_STEP=20, SNAP_ON=True):
        """
        Håndterer all bevegelse:
        - Tegning av ny kraft (arrowTip følger mus – retning fra arrowBase -> mus)
        - Dra anchor  (hele kraften parallellforskyves; anchor er angrepspunkt)
        - Dra arrowTip  (endre retning/lengde – anchor og arrowBase endres ikke)
        - Dra "body" (parallellforskyvning via arrowBase; arrowTip flyttes med samme delta)
        Prinsipp:
        - Kun punktet som redigeres blir snappet.
        - De andre punktene flyttes med samme delta etter snapping (for å bevare retning/lengde).
        - `snap_point` kalles alltid; den respekterer SNAP_ON internt.
        - BARE anchor er begrenset til force drawing area; arrowTip og arrowBase kan gå utenfor.
        """

        if not (self.drawing or self.dragging):
            return False

        # Hvis kraft ikke er redigerbar/bevegelig, ignorer bevegelse
        if not self.editable and not self.moveable:
            return False

        origin = (CENTER_X, CENTER_Y)

        # ---- Tegnemodus: arrowTip følger mus (retning fra arrowBase mot musposisjon) ----
        if self.drawing and self.arrowBase:
            # arrowTip har INGEN grensebegrensning - kan strekke seg utenfor
            self.arrowTip = snap_point(
                pos, angle_deg, GRID_STEP, self.arrowBase,
                snap_on=SNAP_ON
            )
            # Oppdater midlertidig retning/lengde for visning (hvis brukt i UI)
            dx, dy = self.arrowTip[0] - self.arrowBase[0], self.arrowTip[1] - self.arrowBase[1]
            L = math.hypot(dx, dy)
            self.force_dir = (dx / L, dy / L) if L > 1e-6 else (1.0, 0.0)
            self.force_len = L
            return True

        # ---- Dra anchor: parallellforskyv hele kraften (anchor begrenset til tegningsområde) ----
        if self.dragging == "anchor" and self.anchor:
            origin = snap_pts[0] if snap_pts else (CENTER_X, CENTER_Y)  
            snapped_anchor = clamp_to_force_draw_limits(
                snap_point(pos, angle_deg, GRID_STEP, origin,
                          snap_on=SNAP_ON, snap_points=snap_pts)
            )
            delta = vec.sub(snapped_anchor, self.anchor)   # delta ETTER snapping
            self.anchor = snapped_anchor
            if self.arrowBase:
                self.arrowBase =   vec.add(self.arrowBase, delta)
            if self.arrowTip:
                self.arrowTip =   vec.add(self.arrowTip, delta)
            self.update_direction_and_length()
            return True

        # ---- Dra arrowTip: endre kun retning/lengde (INGEN grensebegrensning) ----
        if self.dragging == "arrowTip" and self.arrowBase:
            self.arrowTip = snap_point(
                pos, angle_deg, GRID_STEP, self.arrowBase, snap_on=SNAP_ON
            )
            self.update_direction_and_length()
            return True

        # ---- Dra "body": parallellforskyvning (arrowTip kan gå utenfor grenser) ----
        if self.dragging == "body" and self.arrowBase:
            # Hold grep via drag_offset; snapp arrowBase; flytt arrowTip med samme delta
            raw_arrowBase = vec.add(pos, self.drag_offset)
            f_angle=self.angle_to((0,1)) # 0 Hvis pilen peker rett nedover
            arrowBase_new = snap_point(
                raw_arrowBase, f_angle, GRID_STEP, self.anchor, snap_on=SNAP_ON
            )
            delta = vec.sub(arrowBase_new, self.arrowBase)       # delta ETTER snapping
            self.arrowBase = arrowBase_new
            if self.arrowTip:
                self.arrowTip =   vec.add(self.arrowTip, delta)
            # anchor (angrepspunktet) skal ikke flyttes ved "body"-drag
            self.update_direction_and_length()
            return True
        return False


    def handle_mouse_up(self, pos):
        """
        Avslutter pågående tegning/dragging.
        - Validerer lengde (for korte krefter nullstilles).
        - Rydder statusflagg.
        """
        was_drawing = self.drawing
        self.drawing = False
        self.dragging = None
        self.drag_offset = (0, 0)

        # For kort kraft etter slipp → nullstill punkter (behold ev. navn i UI)
        if self.arrowTip and self.arrowBase and  vec.distance(self.arrowTip, self.arrowBase) < MIN_LEN:
            self.anchor = self.arrowTip = self.arrowBase = None
            self.force_len = 0.0
            return

        # Hvis vi var i tegning, men arrowTip aldri ble satt → nullstill
        if was_drawing and not self.arrowTip:
            self.anchor = self.arrowTip = self.arrowBase = None
            self.force_len = 0.0
            return

        # Oppdater lengde/retning når relevant
        self.update_direction_and_length()

    # ------------------ Internt ------------------
    def update_direction_and_length(self):
        """Oppdater lagret enhetsvektor og lengde (arrowBase→arrowTip)."""
        if self.arrowTip and self.arrowBase:
            dx, dy = self.arrowTip[0] - self.arrowBase[0], self.arrowTip[1] - self.arrowBase[1]
            L = math.hypot(dx, dy)
            if L > 1e-6:
                self.force_dir = (dx / L, dy / L)
                self.force_len = L
            else:
                self.force_len = 0.0

    # ------------------ Kompatibilitet: gamle navn (A, B, C) → nye navn ------------------
    @property
    def A(self):
        """Kompatibilitet: A → anchor"""
        warnings.warn("Force.A is deprecated, use Force.anchor instead", DeprecationWarning, stacklevel=2)
        return self.anchor
    
    @A.setter
    def A(self, value):
        warnings.warn("Force.A is deprecated, use Force.anchor instead", DeprecationWarning, stacklevel=2)
        self.anchor = value
    
    @property
    def B(self):
        """Kompatibilitet: B → arrowTip"""
        warnings.warn("Force.B is deprecated, use Force.arrowTip instead", DeprecationWarning, stacklevel=2)
        return self.arrowTip
    
    @B.setter
    def B(self, value):
        warnings.warn("Force.B is deprecated, use Force.arrowTip instead", DeprecationWarning, stacklevel=2)
        self.arrowTip = value
    
    @property
    def C(self):
        """Kompatibilitet: C → arrowBase"""
        warnings.warn("Force.C is deprecated, use Force.arrowBase instead", DeprecationWarning, stacklevel=2)
        return self.arrowBase
    
    @C.setter
    def C(self, value):
        warnings.warn("Force.C is deprecated, use Force.arrowBase instead", DeprecationWarning, stacklevel=2)
        self.arrowBase = value
