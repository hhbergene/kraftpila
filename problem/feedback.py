# problem/feedback.py
import pygame
import math
from utils.settings import WIDTH, HEIGHT, TEXT_COLOR, BG_COLOR
from utils.settings import get_font

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

@dataclass
class Section:
    texts: list[str] = field(default_factory=list)
    overlays: list[dict[str, Any]] = field(default_factory=list)
    code: Optional[str] = None  # optional; safe to remove if unused

class Feedback:
    def __init__(self):
        self.sections: list[Section] = [Section()]
        self.idx = 0
        self.feedback_window_pos: Optional[tuple[int, int]] = None
        self.score: float = 0.0

    # ---------- section management ----------
    def clear_feedback(self) -> None:
        self.sections = [Section()]
        self.idx = 0
        self.feedback_window_pos = None

    def next_feedback(self, *, code: Optional[str] = None) -> None:
        self.idx += 1
        self.sections.append(Section(code=code))

    def _cur(self) -> Section:
        if self.idx >= len(self.sections):
            self.sections.append(Section())
        return self.sections[self.idx]

    def set_code(self, code: str) -> None:
        self._cur().code = code

    # ---------- content API ----------
    def add_text(self, text: str) -> None:
        self._cur().texts.append(text)

    def _add_overlay(self, data: Dict[str, Any]) -> None:
        self._cur().overlays.append(data)

    def add_point_overlay(self, center, r_ok: float, r_span: float) -> None:
        self._add_overlay({
            "type": "circle",
            "center": tuple(center),
            "r_ok": float(r_ok),
            "r_span": float(r_span),
        })

    def add_angle_overlay(self, center, heading_deg: float, ang_ok: float, ang_span: float,
                          r_ok: float, r_span: float) -> None:
        self._add_overlay({
            "type": "wedge",
            "center": tuple(center),
            "heading_deg": float(heading_deg),
            "ang_ok": float(ang_ok),
            "ang_span": float(ang_span),
            "r_ok": float(r_ok),
            "r_span": float(r_span),
        })

    def add_contact_overlay(self, a, b, r_ok: float, r_span: float) -> None:
        self._add_overlay({
            "type": "stadium",
            "a": tuple(a), "b": tuple(b),
            "r_ok": float(r_ok),
            "r_span": float(r_span),
        })

    # ---------- (optional) serialization ----------
    def to_dict(self) -> dict[str, Any]:
        return {
            "sections": [
                {"code": s.code, "texts": list(s.texts), "overlays": list(s.overlays)}
                for s in self.sections
            ],
            "feedback_window_pos": self.feedback_window_pos,
            "score": self.score,
        }
    # If you don't need to serialize, you can delete this method.

    # ---------- modal feedback window ----------
    def show_feedback(self, screen) -> None:
        """
        Modal, draggable window that pages through sections (texts + overlays).
        ESC/Enter or click outside closes. “Next hint” cycles sections.
        """
        background_base = screen.copy()

        # Dim layer
        dark_overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        dark_overlay.fill((20, 20, 20, 180))

        font_title = get_font(42)
        font_body  = get_font(28)
        font_btn   = get_font(24)

        def score_color(p: float) -> tuple[int, int, int]:
            if p >= 0.8: return (0, 200, 0)
            if p >= 0.5: return (230, 180, 0)
            return (220, 50, 50)

        hint_index = 0
        total_hints = len(self.sections)

        # Window placement/sizing
        box_w = 560
        box_h_min = 200
        if self.feedback_window_pos:
            box_x, box_y = self.feedback_window_pos
        else:
            box_x = WIDTH // 2 - box_w // 2
            box_y = HEIGHT // 2 - box_h_min // 2

        btn_w, btn_h = 170, 36
        dragging = False
        drag_off = (0, 0)
        clock = pygame.time.Clock()

        def window_rect() -> pygame.Rect:
            return pygame.Rect(box_x, box_y, box_w, current_box_h())

        def button_rect(rect: pygame.Rect) -> pygame.Rect:
            return pygame.Rect(rect.centerx - btn_w // 2,
                               rect.bottom - btn_h - 20,
                               btn_w, btn_h)

        # --------- overlays renderer ----------
        def draw_tolerances(target_surf, items: list[dict[str, Any]]) -> None:
            if not items:
                return
            layer = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)

            def draw_circle(cx, cy, r_ok, r_span):
                pygame.draw.circle(layer, (80, 200, 80, 90), (int(cx), int(cy)), int(r_ok))
                for r in range(int(r_ok), int(r_ok + r_span) + 1, 2):
                    # fade outward
                    pygame.draw.circle(layer, (220, 60, 60, 60), (int(cx), int(cy)), r, width=2)

            def draw_stadium(ax, ay, bx, by, r_ok, r_span):
                import math
                A = (float(ax), float(ay)); B = (float(bx), float(by))
                def capsule_outline(A, B, r, deg_step=6):
                    Ax, Ay = A; Bx, By = B
                    dx, dy = (Bx - Ax), (By - Ay)
                    L = (dx*dx + dy*dy) ** 0.5
                    if L < 1e-6:
                        # fall back to circle
                        pts = []
                        for ang in range(0, 361, deg_step):
                            rad = math.radians(ang)
                            pts.append((int(Ax + r * math.cos(rad)), int(Ay + r * math.sin(rad))))
                        return pts
                    tx, ty = dx / L, dy / L
                    nx, ny = -ty, tx
                    def half(center, start_deg, end_deg, step):
                        cx, cy = center; pts = []
                        a = start_deg
                        sgn = 1 if end_deg >= start_deg else -1
                        while (a - end_deg) * sgn <= 0:
                            rad = math.radians(a)
                            px = cx + r * (nx * math.cos(rad) + tx * math.sin(rad))
                            py = cy + r * (ny * math.cos(rad) + ty * math.sin(rad))
                            pts.append((int(px), int(py)))
                            a += step * sgn
                        rad = math.radians(end_deg)
                        px = cx + r * (nx * math.cos(rad) + tx * math.sin(rad))
                        py = cy + r * (ny * math.cos(rad) + ty * math.sin(rad))
                        if pts: pts[-1] = (int(px), int(py))
                        return pts
                    A_plus  = (Ax + nx * r, Ay + ny * r)
                    B_plus  = (Bx + nx * r, By + ny * r)
                    B_minus = (Bx - nx * r, By - ny * r)
                    A_minus = (Ax - nx * r, Ay - ny * r)
                    outline = []
                    outline.append((int(A_plus[0]), int(A_plus[1])))
                    outline.append((int(B_plus[0]), int(B_plus[1])))
                    outline += half(B, 0, 180, 6)
                    outline.append((int(B_minus[0]), int(B_minus[1])))
                    outline.append((int(A_minus[0]), int(A_minus[1])))
                    outline += half(A, 180, 360, 6)
                    return outline
                poly_ok = capsule_outline(A, B, r_ok, deg_step=4)
                if len(poly_ok) >= 3:
                    pygame.draw.polygon(layer, (80, 200, 80, 90), poly_ok)
                for dr in range(0, int(r_span) + 1, 2):
                    outer = capsule_outline(A, B, r_ok + dr, deg_step=6)
                    inner = capsule_outline(A, B, max(0, r_ok + dr - 2), deg_step=6)
                    if len(outer) >= 3 and len(inner) >= 3:
                        ring = outer + list(reversed(inner))
                        pygame.draw.polygon(layer, (220, 60, 60, 60), ring)

            def draw_wedge(cx, cy, heading_deg, ang_ok, ang_span, r_ok, r_span):
                import math
                cxi, cyi = int(cx), int(cy)
                a0 = float(heading_deg)
                def arc(radius, a1, a2, step=1):
                    pts = []
                    start, end = (a1, a2) if a1 <= a2 else (a2, a1)
                    a = start
                    while a <= end:
                        rad = math.radians(a)
                        pts.append((int(cxi + radius*math.cos(rad)),
                                    int(cyi + radius*math.sin(rad))))
                        a += step
                    rad = math.radians(a2)
                    if pts:
                        pts[-1] = (int(cxi + radius*math.cos(rad)), int(cyi + radius*math.sin(rad)))
                    return pts
                def ring_sector(r_in, r_out, a1, a2, color):
                    outer = arc(r_out, a1, a2)
                    inner = arc(r_in,  a1, a2)
                    if len(outer) >= 2 and len(inner) >= 2:
                        pygame.draw.polygon(layer, color, outer + list(reversed(inner)))

                # green core
                if ang_ok > 0:
                    ring_sector(0, int(r_ok), int(a0-ang_ok), int(a0+ang_ok), (80,200,80,170))
                # red fade band
                if ang_span > 0 and r_span > 0:
                    steps = max(1, int(r_span/3))
                    for i in range(steps, -1, -1):
                        t = i/max(1, steps)
                        r_out = int(r_ok + t*r_span)
                        r_in  = int(r_ok + max(0, (t - 1/steps))*r_span)
                        alpha = int(150 * (1.0 - t))
                        if alpha > 0:
                            ring_sector(r_in, r_out, int(a0+ang_ok), int(a0+ang_ok+ang_span), (220,60,60,alpha))
                            ring_sector(r_in, r_out, int(a0-ang_ok-ang_span), int(a0-ang_ok), (220,60,60,alpha))

            for it in items:
                t = it.get("type")
                if t == "circle":
                    cx, cy = it["center"]
                    draw_circle(cx, cy, it["r_ok"], it["r_span"])
                elif t == "stadium":
                    (ax, ay) = it["a"]; (bx, by) = it["b"]
                    draw_stadium(ax, ay, bx, by, it["r_ok"], it["r_span"])
                elif t == "wedge":
                    cx, cy = it["center"]
                    draw_wedge(cx, cy, it.get("heading_deg", 90.0),
                               it["ang_ok"], it["ang_span"], it["r_ok"], it["r_span"])

            target_surf.blit(layer, (0, 0))

        # ---- text wrapping helper (replace if you have one already) ----
        def wrap_lines(texts: list[str], font, max_width: int) -> list[str]:
            """Very simple greedy wrapper per text entry."""
            wrapped: list[str] = []
            for t in texts:
                if not t:
                    wrapped.append("")
                    continue
                words = t.split()
                line = ""
                for w in words:
                    test = (line + " " + w).strip()
                    if font.size(test)[0] <= max_width:
                        line = test
                    else:
                        if line:
                            wrapped.append(line)
                        line = w
                if line:
                    wrapped.append(line)
            return wrapped

        def current_box_h() -> int:
            # dynamic height based on current section
            rect_w = box_w
            inner_w = rect_w - 80
            sect = self.sections[hint_index]
            wrapped = wrap_lines(sect.texts, font_body, inner_w)
            # title + lines + button area
            h = 40 + 36  # top padding + title line
            h += len(wrapped) * (font_body.get_height() + 8) + 20
            if total_hints > 1:
                h += btn_h + 24
            return max(h, box_h_min)

        def draw_window():
            screen.blit(background_base, (0, 0))
            screen.blit(dark_overlay, (0, 0))

            # overlays for current section
            draw_tolerances(screen, self.sections[hint_index].overlays)

            # window
            rect = window_rect()
            pygame.draw.rect(screen, (245, 245, 245), rect, border_radius=16)
            pygame.draw.rect(screen, (80, 80, 80), rect, width=2, border_radius=16)

            # title
            title = f"{round(self.score * 100)} % riktig"
            title_col = score_color(self.score)
            title_surf = font_title.render(title, True, title_col)
            title_rect = title_surf.get_rect(center=(rect.centerx, rect.y + 40))
            screen.blit(title_surf, title_rect)

            # body lines
            inner_left = rect.x + 40
            inner_right = rect.right - 40
            max_text_w = inner_right - inner_left
            wrapped = wrap_lines(self.sections[hint_index].texts, font_body, max_text_w)

            y = title_rect.bottom + 16
            for line in wrapped:
                s = font_body.render(line, True, (30, 30, 30))
                screen.blit(s, (inner_left, y))
                y += s.get_height() + 8

            # button
            if total_hints > 1:
                brect = button_rect(rect)
                pygame.draw.rect(screen, (230, 230, 230), brect, border_radius=8)
                pygame.draw.rect(screen, (90, 90, 90), brect, width=2, border_radius=8)
                label = "Neste hint ➜" if hint_index < total_hints - 1 else "Ferdig"
                btn_surf = font_btn.render(label, True, (10, 10, 10))
                screen.blit(btn_surf, btn_surf.get_rect(center=brect.center))

            pygame.display.flip()

        # initial draw
        draw_window()

        # event loop
        waiting = True
        while waiting:
            clock.tick(60)
            for e in pygame.event.get():
                if e.type == pygame.QUIT:
                    pygame.quit()
                    raise SystemExit

                if e.type == pygame.KEYDOWN:
                    if e.key in (pygame.K_ESCAPE, pygame.K_RETURN):
                        waiting = False
                        break

                elif e.type == pygame.MOUSEBUTTONDOWN:
                    mx, my = e.pos
                    if window_rect().collidepoint(mx, my):
                        # button?
                        if total_hints > 1 and button_rect(window_rect()).collidepoint(mx, my):
                            if hint_index < total_hints - 1:
                                hint_index += 1
                                draw_window()
                            else:
                                waiting = False
                                break
                        else:
                            dragging = True
                            drag_off = (mx - box_x, my - box_y)
                    else:
                        waiting = False
                        break

                elif e.type == pygame.MOUSEBUTTONUP:
                    dragging = False

                elif e.type == pygame.MOUSEMOTION and dragging:
                    mx, my = e.pos
                    # clamp so the window stays in view
                    new_x = max(0, min(WIDTH - box_w, mx - drag_off[0]))
                    new_y = max(0, min(HEIGHT - current_box_h(), my - drag_off[1]))
                    if new_x != box_x or new_y != box_y:
                        box_x, box_y = new_x, new_y
                        draw_window()

        self.feedback_window_pos = (box_x, box_y)


    def draw_live_feedback(self, screen, *,
                           bottom_right: tuple[int, int] | None = None,
                           max_width: int = 320,
                           max_lines: int = 6) -> None:
        """
        Lightweight HUD (non-modal): shows percentage + a few hint lines
        from the *last* section.
        """
        W = screen.get_width()
        H = screen.get_height()
        if bottom_right is None:
            bottom_right = (W - 16, H - 16)

        font_title = get_font(18)
        font_body  = get_font(14)

        title = f"{round(self.score * 100)} % riktig"
        body_src = self.sections[-1].texts if self.sections else []
        body_lines = body_src[:max_lines]

        title_surf = font_title.render(title, True, (20, 20, 20))
        line_surfs = [font_body.render(s, True, (40, 40, 40)) for s in body_lines]

        inner_w = min(
            max([title_surf.get_width(), *(ls.get_width() for ls in line_surfs)] if line_surfs else [title_surf.get_width()]),
            max_width - 24
        )
        inner_h = title_surf.get_height() + 8 + sum(ls.get_height() + 4 for ls in line_surfs)

        pad = 10
        box_w = inner_w + 2 * pad
        box_h = inner_h + 2 * pad
        box_x = bottom_right[0] - box_w
        box_y = bottom_right[1] - box_h

        bg = pygame.Surface((box_w, box_h), pygame.SRCALPHA)
        bg.fill((245, 245, 245, 230))
        pygame.draw.rect(bg, (100, 100, 100), bg.get_rect(), width=1, border_radius=8)

        col = (0, 160, 0) if self.score >= 0.8 else (200, 150, 0) if self.score >= 0.5 else (200, 50, 50)
        title_colored = font_title.render(title, True, col)

        screen.blit(bg, (box_x, box_y))

        cx = box_x + pad
        cy = box_y + pad
        screen.blit(title_colored, (cx, cy))
        cy += title_surf.get_height() + 8

        for ls in line_surfs:
            if ls.get_width() > inner_w:
                crop = pygame.Surface((inner_w, ls.get_height()), pygame.SRCALPHA)
                crop.blit(ls, (0, 0))
                screen.blit(crop, (cx, cy))
            else:
                screen.blit(ls, (cx, cy))
            cy += ls.get_height() + 4