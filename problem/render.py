# ./problem/render.py
from __future__ import annotations
import math
from typing import Iterable, Optional, Tuple, List

import pygame

import utils.geometry as vec
from utils.settings import BLOCK_COLOR, TEXT_COLOR, GRID_COLOR, FORCE_COLOR, SCENE_ALPHA, get_font
from utils.settings import WIDTH, TOP_Y, BTN_H, BTN_GAP
from engine.render import _aa_line, _arrow, _circle, _text
from .spec import TaskSpec, SceneSpec, PlaneSpec, RectSpec, ArrowSpec, TextSpec, AnchorType


# -----------------------------
# Farge- og stilkonstanter (brukes kombinert med settings.py)
# -----------------------------
COLOR_BG        = (245, 246, 250)
COLOR_PLANE     = (180, 180, 190)
COLOR_RECT      = BLOCK_COLOR           # Fra settings
COLOR_RECT_EDGE = (90, 90, 100)
COLOR_FORCE     = FORCE_COLOR           # Fra settings (255,80,80)
COLOR_FORCE_N   = (30, 150, 80)         # alternativ farge for normalkraft
COLOR_TEXT      = TEXT_COLOR            # Fra settings (0,0,0)
COLOR_DIM       = (130, 130, 140)
COLOR_GUIDE     = (200, 120, 30)
COLOR_CONTACT   = (200, 80, 30)
COLOR_POINT_OK  = (40, 160, 90)
COLOR_POINT_ERR = (200, 60, 60)
COLOR_ANGLE     = (150, 60, 180)
COLOR_SNAP      = GRID_COLOR            # Fra settings (220, 220, 220)

ALPHA_FEEDBACK  = 120

# Helper for rect geometry (task-specific)
def _rect_points(rect: RectSpec) -> Tuple[Tuple[float,float], Tuple[float,float], Tuple[float,float], Tuple[float,float]]:
    """Get four corner points of a rotated rectangle."""
    # Use the four corners from RectSpec
    return (rect.left_top, rect.right_top, rect.right_bottom, rect.left_bottom)

# -----------------------------
# Renderer
# -----------------------------

class Renderer:
    def __init__(self, grid: int = 10):
        self.grid = grid
        self.font_title = get_font(22, "Arial")
        self.font_hint  = get_font(16, "Arial")

    # Hovedinngang
    def draw_scene(
        self,
        surface: pygame.Surface,
        task: TaskSpec,
        snap_on: bool = False,
        feedback: Optional[object] = None,
    ):
        """Draw scene (plane, geometry, snap points, title, short_lines).
        
        Parameters:
        - surface: pygame surface to draw on
        - task: TaskSpec with scene, title, short_lines
        - snap_on: whether to draw snap points
        - feedback: optional feedback overlays
        """
        self._draw_scene(surface, task.scene)
        self._draw_snap_points(surface, task.scene, snap_on)
        self._draw_title_and_short_lines(surface, task)
        if feedback:
            self._draw_feedback(surface, feedback)

    # Bakgrunn - kan brukes av main.py hvis needed
    def _clear(self, surface: pygame.Surface):
        surface.fill(COLOR_BG)

    # Scene: plan + rektangel (kloss)
    def _draw_scene(self, surface: pygame.Surface, scene: SceneSpec):
        # plan
        if scene.plane:
            self._draw_plane(surface, scene.plane)

        # klosser (rektangler)
        for rect in scene.rects:
            self._draw_rect(surface, rect)

        # sirkler
        for circle in scene.circles:
            self._draw_circle(surface, circle)

        # segmenter (linjer)
        for segment in scene.segments:
            self._draw_segment(surface, segment)

        # pilar
        for arrow in scene.arrows:
            self._draw_arrow(surface, arrow)

        # tekst
        for text in scene.texts:
            self._draw_text(surface, text)

    def _draw_plane(self, surface: pygame.Surface, plane: PlaneSpec):
        """Tegn planet som en stripe (hvis visible=True)."""
        # Sjekk visible flagget
        if not plane.visible:
            return
        
        w, h = surface.get_size()
        
        # Bruk plane.through som referansepunkt og plane.angle_deg for retning
        x0, y0 = plane.through
        ang = math.radians(plane.angle_deg)
        
        # Tangent-vektor langs planet (math convention: y opp)
        t_x, t_y = math.cos(ang), -math.sin(ang)
        
        # Finn to punkter langt utenfor skjermbredden langs planet
        span = (w**2 + h**2)**0.5
        a = (x0 - t_x * span, y0 - t_y * span)
        b = (x0 + t_x * span, y0 + t_y * span)
        
        # Tegn stripe med valgfri farge og bredde
        color = plane.color if plane.color is not None else COLOR_PLANE
        thickness = plane.stroke_width if plane.stroke_width is not None else 4
        pygame.draw.line(surface, color, a, b, thickness)


    def _draw_rect(self, surface: pygame.Surface, rect: RectSpec):
        """Draw a rectangle with corners and optional fill."""
        p0, p1, p2, p3 = _rect_points(rect)
        
        # Tegn fylling hvis spesifisert
        if rect.fill_color is not None:
            # Lag en transparent overflate for fylling
            fill_surf = pygame.Surface((surface.get_width(), surface.get_height()), pygame.SRCALPHA)
            alpha_color = rect.fill_color + (int(255 * SCENE_ALPHA),)
            pygame.draw.polygon(fill_surf, alpha_color, [p0, p1, p2, p3])
            surface.blit(fill_surf, (0, 0))
        
        # Tegn kant
        color = rect.color if rect.color is not None else COLOR_RECT_EDGE
        thickness = rect.stroke_width if rect.stroke_width is not None else 2
        pygame.draw.polygon(surface, color, [p0, p1, p2, p3], thickness)

        # Tegn snap-punkter (diskret visuelt hint)
        #_circle(surface, COLOR_DIM, rect.center, 3, 0)
        #_circle(surface, COLOR_DIM, rect.bottom_center, 3, 0)

    def _draw_circle(self, surface: pygame.Surface, circle):
        """Draw a circle (CircleSpec) with optional fill."""
        center = circle.center
        radius = circle.radius
        
        # Tegn fylling hvis spesifisert
        if circle.fill_color is not None:
            fill_surf = pygame.Surface((surface.get_width(), surface.get_height()), pygame.SRCALPHA)
            alpha_color = circle.fill_color + (int(255 * SCENE_ALPHA),)
            pygame.draw.circle(fill_surf, alpha_color, (int(center[0]), int(center[1])), int(radius))
            surface.blit(fill_surf, (0, 0))
        
        # Tegn kant
        color = circle.color if circle.color is not None else COLOR_RECT_EDGE
        thickness = circle.stroke_width if circle.stroke_width is not None else 2
        _circle(surface, color, center, int(radius), thickness)
        # Mark center
        #_circle(surface, COLOR_DIM, center, 3, 0)

    def _draw_segment(self, surface: pygame.Surface, segment):
        """Draw a line segment (SegmentSpec)."""
        color = segment.color if segment.color is not None else COLOR_RECT_EDGE
        thickness = segment.stroke_width if segment.stroke_width is not None else 2
        pygame.draw.line(surface, color, segment.a, segment.b, thickness)

    def _draw_arrow(self, surface: pygame.Surface, arrow):
        """Draw an arrow (ArrowSpec) with optional styling for body and arrowhead."""
        from engine.render import draw_dotted_line
        
        color = arrow.color if arrow.color is not None else COLOR_RECT_EDGE
        thickness = arrow.stroke_width if arrow.stroke_width is not None else 2
        
        # Draw the body (line from a to b)
        if arrow.body == "dashed":
            draw_dotted_line(surface, color, arrow.a, arrow.b, thickness, dash_size=5)
        elif arrow.body == "double":
            # Draw two parallel lines for double effect
            n = vec.unit(vec.left_normal(vec.sub(arrow.b, arrow.a)))
            offset = 4
            off_a = vec.add(n, (0, 0))
            off_b = vec.add(n, (0, 0))
            off_vec = vec.scale(n, offset)
            line1_a = vec.add(arrow.a, off_vec)
            line1_b = vec.add(arrow.b, off_vec)
            line2_a = vec.sub(arrow.a, off_vec)
            line2_b = vec.sub(arrow.b, off_vec)
            pygame.draw.line(surface, color, line1_a, line1_b, thickness)
            pygame.draw.line(surface, color, line2_a, line2_b, thickness)
        else:  # "single" (default)
            pygame.draw.line(surface, color, arrow.a, arrow.b, thickness)
        
        # Draw arrowhead(s)
        if arrow.arrowhead == "double":
            # Draw arrowheads at both ends
            self._draw_arrowhead(surface, color, arrow.b, arrow.a)  # arrowhead at b pointing back to a
            self._draw_arrowhead(surface, color, arrow.a, arrow.b)  # arrowhead at a pointing to b
        else:  # "single" (default)
            self._draw_arrowhead(surface, color, arrow.b, arrow.a)  # arrowhead at b

    def _draw_arrowhead(self, surface: pygame.Surface, color: Tuple[int, int, int], 
                       tip: Tuple[float, float], direction_point: Tuple[float, float]):
        """Draw a triangular arrowhead at 'tip' pointing from 'direction_point' towards 'tip'."""
        u = vec.sub(direction_point, tip)  # vector from tip back along the line
        if vec.norm(u) < 1e-6:
            return
        e = vec.unit(u)
        # Triangle pointing at tip
        ARROW_HEAD_ANG = math.radians(22)
        ARROW_HEAD_LEN = 12
        left_v = vec.scale(vec.rot_deg(e, math.degrees(ARROW_HEAD_ANG)), ARROW_HEAD_LEN)
        right_v = vec.scale(vec.rot_deg(e, -math.degrees(ARROW_HEAD_ANG)), ARROW_HEAD_LEN)
        left = vec.add(tip, left_v)
        right = vec.add(tip, right_v)
        pygame.draw.polygon(surface, color, [tip, left, right])

    def _draw_text(self, surface: pygame.Surface, text: TextSpec):
        """Draw text (TextSpec) at specified position with alignment."""
        font = get_font(text.size, text.font)
        img = font.render(text.txt, True, text.color)
        r = img.get_rect()
        
        # Apply alignment
        if text.align == "left":
            r.topleft = text.pos
        elif text.align == "right":
            r.topright = text.pos
        else:  # "center"
            r.center = text.pos
        
        surface.blit(img, r)

    def _draw_snap_points(self, surface: pygame.Surface, scene: SceneSpec, snap_on: bool):
        """Draw snap points if snapping is enabled."""
        if not snap_on:
            return
        snap_points = scene.snap_points()
        for pt in snap_points:
            _circle(surface, COLOR_SNAP, pt, 4, 1)  # outline circle

    def _draw_title_and_short_lines(self, surface: pygame.Surface, task: TaskSpec):
        """Draw task title and short instruction lines at top-left."""
        if not task.title:
            return

        # Place title in the left panel area to match ui.layout.draw_title
        x = WIDTH // 4
        y = TOP_Y + BTN_H + BTN_GAP

        title_surf = self.font_title.render(task.title, True, COLOR_TEXT)
        title_rect = title_surf.get_rect()
        title_rect.midleft = (x, y + title_rect.height // 2)
        surface.blit(title_surf, title_rect)

        if task.short_lines:
            y_line = title_rect.bottom + 2
            for line in task.short_lines[:3]:
                line_surf = self.font_hint.render(line, True, COLOR_DIM)
                line_rect = line_surf.get_rect(midleft=(x, y_line + line_surf.get_height() // 2))
                surface.blit(line_surf, line_rect)
                y_line = line_rect.bottom + 2
    def _draw_forces(self, surface: pygame.Surface, task: TaskSpec, forces: Iterable):
        """
        Forventer Force-objekter med minst:
            .A (startpunkt/angrepspunkt)  Tuple[float,float]
            .B (endepunkt)                Tuple[float,float]  (brukes til å tegne pil)
            .vec                          Tuple[float,float]  (vektor)
            .name                         str
            .is_named()/has_name()        (valgfritt; ikke brukt her)
            .C                            (valgfritt, label-pos)

        Hvis .B mangler men .vec finnes, tegnes pil A -> A+vec.
        """
        for f in forces:
            A = getattr(f, "A", None)
            V = getattr(f, "vec", None)
            B = getattr(f, "B", None)

            if A is None:
                # fall-back: forsøk midt i første kloss om tilgjengelig
                if task.scene and task.scene.rects:
                    A = task.scene.rects[0].center
                else:
                    continue

            if B is None:
                if V is None:
                    # uten vektor, prøv C som andre punkt
                    C = getattr(f, "C", None)
                    if C is None:
                        continue
                    B = C
                else:
                    B = vec.add(A, V)

            # velg farge (N i grønnere tone)
            name = (getattr(f, "name", "") or "").strip().lower()
            color = COLOR_FORCE_N if name in {"n", "na", "normalkraft", "r", "fn"} else COLOR_FORCE

            _arrow(surface, color, A, B, 3)

            # label
            lbl = getattr(f, "name", None)
            if not lbl:
                # prøv key hvis tilstede
                lbl = getattr(f, "key", "")
            if lbl:
                tip = B
                _text(surface, str(lbl), vec.add(tip, (8, -8)), color, 16, "tl")

    # Feedback-overlays (vinkler, kontaktsegment, punkter, tekster)
    def _draw_feedback(self, surface: pygame.Surface, fb):
        """
        Forventer en feedback-struktur som du bygger i evaluator,
        f.eks. med lister:
          fb.angles: [ (center, angle_deg, tol, span, rx, ry), ... ]
          fb.contacts: [ (a, b, tol, span), ... ]
          fb.points: [ (p, tol, span, ok_bool), ... ]
          fb.texts: ["melding...", ...]
        Tilpass dette til din faktiske Feedback-klasse.
        """
        # Legg semi-transparent lag for tydelige hint
        overlay = pygame.Surface(surface.get_size(), pygame.SRCALPHA)

        # Vinkler
        for item in getattr(fb, "angles", []):
            c, ang_deg, tol, span, rx, ry = item
            self._draw_angle_overlay(overlay, c, ang_deg, tol, span, rx, ry)

        # Kontaktlinjer
        for item in getattr(fb, "contacts", []):
            a, b, tol, span = item
            self._draw_contact_overlay(overlay, a, b, tol, span)

        # Punktmarkører
        for item in getattr(fb, "points", []):
            p, tol, span, ok = item
            self._draw_point_overlay(overlay, p, tol, span, ok)

        surface.blit(overlay, (0, 0))

        # Tekstmeldinger (nederst til venstre)
        y = surface.get_height() - 8
        for msg in getattr(fb, "texts", []):
            img = self.font_hint.render(str(msg), True, COLOR_TEXT)
            r = img.get_rect()
            y -= (r.height + 6)
            r.topleft = (10, y)
            surface.blit(img, r)

    def _draw_angle_overlay(self, overlay: pygame.Surface, center: Tuple[float,float],
                            angle_deg: float, tol: float, span: float, rx: float, ry: float):
        # tegn vifte med tol og span
        base = math.radians(angle_deg)
        tol_r  = math.radians(tol)
        span_r = math.radians(span)

        # “OK”-sektor
        ok_a = base - tol_r
        ok_b = base + tol_r
        self._wedge(overlay, center, rx, ry, ok_a, ok_b, (*COLOR_POINT_OK, ALPHA_FEEDBACK))

        # “Usikker”-sektor
        lo_a = ok_a - span_r
        lo_b = ok_a
        hi_a = ok_b
        hi_b = ok_b + span_r
        self._wedge(overlay, center, rx, ry, lo_a, lo_b, (*COLOR_ANGLE, ALPHA_FEEDBACK))
        self._wedge(overlay, center, rx, ry, hi_a, hi_b, (*COLOR_ANGLE, ALPHA_FEEDBACK))

        # midtvektor
        r = (rx + ry) * 0.5
        tip = vec.add(center, (math.cos(base) * r, math.sin(base) * r))
        _arrow(overlay, COLOR_ANGLE, center, tip, 2)

    def _wedge(self, surface: pygame.Surface, c: Tuple[float,float], rx: float, ry: float,
               a0: float, a1: float, color_rgba: Tuple[int,int,int,int]):
        steps = max(10, int(abs(a1 - a0) * 36))
        pts = [(c[0], c[1])]
        for i in range(steps + 1):
            t = a0 + (a1 - a0) * (i / steps)
            x = c[0] + rx * math.cos(t)
            y = c[1] + ry * math.sin(t)
            pts.append((x, y))
        pygame.draw.polygon(surface, color_rgba, pts)

    def _draw_contact_overlay(self, surface: pygame.Surface, a: Tuple[float,float], b: Tuple[float,float], tol: float, span: float):
        # selve segmentet
        _aa_line(surface, COLOR_CONTACT, a, b, 3)
        # toleranse-sone som bånd rundt linja
        # (for enkelhet: tegn to parallelle linjer i dim-farge)
        n = vec.unit(vec.left_normal(vec.sub(b, a)))
        off1 = vec.add(vec.scale(n, tol), (0, 0))
        off2 = vec.add(vec.scale(n, -(tol)), (0, 0))
        _aa_line(surface, COLOR_DIM, vec.add(a, off1), vec.add(b, off1), 1)
        _aa_line(surface, COLOR_DIM, vec.add(a, off2), vec.add(b, off2), 1)

    def _draw_point_overlay(self, surface: pygame.Surface, p: Tuple[float,float], tol: float, span: float, ok: bool):
        # sirkel med toleranse
        r_ok  = max(3, int(tol))
        r_lo  = max(r_ok + 6, int(tol + span))
        col_o = COLOR_POINT_OK if ok else COLOR_POINT_ERR
        pygame.draw.circle(surface, (*col_o, ALPHA_FEEDBACK), (int(p[0]), int(p[1])), r_ok, 0)
        pygame.draw.circle(surface, (*COLOR_DIM, ALPHA_FEEDBACK), (int(p[0]), int(p[1])), r_lo, 2)

    def _draw_caption(self, surface: pygame.Surface, task: TaskSpec):
        """Draw task caption (title and short lines).
        Note: This is handled by panel.draw_title in main.py, so this is typically not called.
        """
        title = task.title or task.id
        img = self.font_title.render(title, True, COLOR_TEXT)
        surface.blit(img, (10, 8))

        # Draw short_lines if present
        if task.short_lines:
            y = 40
            for line in task.short_lines:
                _text(surface, line, (12, y), COLOR_DIM, 14, "tl")
                y += 20
