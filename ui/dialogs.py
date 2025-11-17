# ui/dialogs.py
import pygame
import math
from utils.settings import WIDTH, HEIGHT, TEXT_COLOR, BG_COLOR
from utils.settings import get_font

_last_feedback_pos = None

def show_feedback(screen, pct, lines, overlays=None):
    """
    Flyttbart feedback-vindu med hint-knapp.
    - Ingen ghosting: vi re-tegner bakgrunnssnapshot + overlay for hver redraw.
    - Responsivt: egen loop med clock.tick(60), lukker umiddelbart ved ESC/klikk utenfor.
    - "Fake blur": placeholder (se kommentar) – kan erstattes med smoothscale-ned/opp.
    """

    global _last_feedback_pos  # For lagring av posisjon mellom kall
    global_overlays = []
    per_hint_overlays = {}  # {int: list_of_items}
    if isinstance(overlays, dict):
        global_overlays = overlays.get("global", []) or []
        # tillat både int og str nøkler for hint-indekser
        for k, v in overlays.items():
            if k == "global":
                continue
            try:
                idx = int(k)
                per_hint_overlays[idx] = v or []
            except (TypeError, ValueError):
                pass
    elif isinstance(overlays, list):
        # tolk som EITHER "global liste" ELLER "liste av lister" på lengde == lines
        if lines and all(isinstance(x, list) for x in overlays) and len(overlays) == len(lines):
            per_hint_overlays = {i: (overlays[i] or []) for i in range(len(lines))}
        else:
            global_overlays = overlays or []
    else:
        global_overlays = []
    # ---------- Ta snapshot av bakgrunnen (for å unngå ghosting) ----------
    # OBS: Hvis du vil ha "blur", kan du lage en kopi, nedskalere og oppskalere:
    # bg = screen.copy()
    # small = pygame.transform.smoothscale(bg, (WIDTH//4, HEIGHT//4))
    # blurred = pygame.transform.smoothscale(small, (WIDTH, HEIGHT))
    # background_base = blurred
    background_base = screen.copy()

    # Halvtransparent overlay (mørkner litt, men vi re-blitter hver gang)
    overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
    overlay.fill((20, 20, 20, 180))

    # ---------- Fonter / farger ----------
    font_title = get_font( 42)
    font_body  = get_font( 28)
    font_btn   = get_font( 24)

    color = (0, 200, 0) if pct >= 0.8 else (230, 180, 0) if pct >= 0.5 else (220, 50, 50)

    # ---------- Layout ----------
    hint_index = 0
    total_hints = len(lines)

    max_w = 0
    for l in lines:
        surf = font_body.render(l, True, TEXT_COLOR)
        max_w = max(max_w, surf.get_width())

    box_w = max(380, max_w + 80)
    box_h = 200
    if _last_feedback_pos:
        box_x, box_y = _last_feedback_pos
        # sørg for at boksen ikke havner utenfor vinduet
        box_x = max(0, min(WIDTH - box_w, box_x))
        box_y = max(0, min(HEIGHT - box_h, box_y))
    else:
        box_x = WIDTH // 2 - box_w // 2
        box_y = HEIGHT // 2 - box_h // 2

    btn_w, btn_h = 160, 36  # litt bredere
    dragging = False
    drag_off = (0, 0)

    clock = pygame.time.Clock()

    def window_rect():
        return pygame.Rect(box_x, box_y, box_w, box_h)

    def button_rect():
        return pygame.Rect(box_x + box_w//2 - btn_w//2, box_y + box_h - btn_h - 20, btn_w, btn_h)

    def draw_tolerances_for_hint(hidx: int):
        items = []
        items += global_overlays
        items += per_hint_overlays.get(hidx, [])
        draw_tolerances(screen, items)
 
    def draw_tolerances(surf, items):
        def draw_circle(cx, cy, r_ok, r_span):
            # 100%-område (lysegrønt, fylt)
            pygame.draw.circle(layer, (80, 200, 80, 90), (int(cx), int(cy)), int(r_ok))
            # Overgangsområde: tynn, semitransparent ring (lyserødt mot 0%)
            for r in range(int(r_ok), int(r_ok + r_span) + 1, 2):
                t = (1.0-(r - r_ok) / max(1, r_span))  # 0..1
                # svak rød kontur som øker i alpha
                col = (220, 60, 60, int(30 + 90 * t))
                pygame.draw.circle(layer, col, (int(cx), int(cy)), r, width=2)
            return


        def draw_stadium(ax, ay, bx, by, r_ok, r_span):
            """
            Stadium/kapsel langs A→B med halvsirkler i endene.
            A(ax,ay) og B(bx,by) er *sentrene* i halvsirklene.
            - r_ok:  fylt 100%-bånd (grønt)
            - r_span: tykkelse på overgangsbåndet (røde ringer utenpå)
            Sømløs utfylling og kontur (ett sammenhengende polygon pr. bånd).
            """
            import math

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

            # Tegn fylt kapsel (100%-bånd)
            poly_ok = capsule_outline(A, B, r_ok, deg_step=4)  # tettere sampling = jevnere halvsirkel
            pygame.draw.polygon(layer, (80, 200, 80, 90), poly_ok)

            # Tegn konsentriske ring-bånd utenpå (sømløs polygon mellom r_in og r_out)
            if r_span > 0:
                step = 2
                for dr in range(0, int(r_span) + 1, step):
                    r_out = r_ok + dr
                    r_in  = max(0, r_out - 2)  # ~2 px tykk ring
                    t = 1.0 - (dr / max(1, r_span))
                    alpha = int(30 + 90 * t)   # fade som før

                    outer = capsule_outline(A, B, r_out, deg_step=6)
                    inner = capsule_outline(A, B, r_in,  deg_step=6)
                    if len(outer) >= 3 and len(inner) >= 3:
                        ring_poly = outer + list(reversed(inner))
                        pygame.draw.polygon(layer, (220, 60, 60, alpha), ring_poly)
        def draw_stadium_old(ax, ay, bx, by, r_ok, r_span):
            # Sørg for venstre→høyre-rekkefølge
            left_x  = min(ax, bx)
            right_x = max(ax, bx)
            w = max(1, right_x - left_x)   # bredde på kontaktlinja
            cy = ay                         # antatt horisontal kontaktlinje

            # 100%-bånd: fylt, lysegrønt, med halvsirkler i endene
            base_rect = pygame.Rect(left_x, cy - r_ok, w, 2 * r_ok)
            # border_radius = r_ok gir nøyaktig halvsirkler i endene når høyden = 2*r_ok
            pygame.draw.rect(layer, (80, 200, 80, 90), base_rect, border_radius=int(r_ok))

            # Overgangsbånd: konsentriske konturer med økende radius/alpha
            # NB: border_radius kan ikke være større enn min(w/2, h/2).
            # Her er h/2 = rr; derfor clamp mot w/2 for korte kontaktflater.
            half_w = w / 2.0
            for dr in range(0, int(r_span) + 1, 2):
                rr = r_ok + dr
                rr_clamped = int(min(rr, half_w))  # bevarer halvsirkel-geometri på korte flater
                col = (220, 60, 60, int(30 + 90 * (1.0-dr / max(1, r_span))))  # lysrød → sterkere
                rect2 = pygame.Rect(left_x, cy - rr, w, 2 * rr)
                pygame.draw.rect(layer, col, rect2, width=2, border_radius=rr_clamped)
            return

        def draw_wedge(cx, cy, heading_deg, ang_ok, ang_span, r_ok, r_span,
                    col_g=(80,200,80), col_r=(220,60,60),
                    alpha_g=(170, 0), alpha_r=(150, 0),
                    deg_step_arc=1, deg_slice=3):
            """
            Grønn sektor (±ang_ok) med radial alfa-fade: alpha_g=(ved r_ok, ved r_ok+r_span)
            Rød 'utenfor' (ang_ok→ang_ok+ang_span) med radial + ANGULÆR alfa-fade:
            - radial: alpha_r=(ved r_ok, ved r_ok+r_span)
            - angulær: opak ved ang_ok → 0 ved ang_ok+ang_span
            Tegner ytterst→innerst for pen blending.
            """
            import math
            cxi, cyi = int(cx), int(cy)

            # Vinkelgrenser
            a0 = float(heading_deg)
            a_ok_lo, a_ok_hi = a0 - ang_ok, a0 + ang_ok
            a_max_lo, a_max_hi = a0 - (ang_ok + ang_span), a0 + (ang_ok + ang_span)

            def arc_points(cx, cy, radius, start_deg, end_deg, step_deg=1):
                pts = []
                s, e = (start_deg, end_deg) if start_deg <= end_deg else (end_deg, start_deg)
                a = s
                while a <= e:
                    rad = math.radians(a)
                    pts.append((int(cx + radius*math.cos(rad)), int(cy + radius*math.sin(rad))))
                    a += step_deg
                # siste punkt nøyaktig på end_grad
                rad_e = math.radians(end_deg)
                if pts:
                    pts[-1] = (int(cx + radius*math.cos(rad_e)), int(cy + radius*math.sin(rad_e)))
                return pts

            def ring_sector(r_in, r_out, start_deg, end_deg, color_rgba):
                if r_out <= r_in or end_deg == start_deg:
                    return
                outer = arc_points(cxi, cyi, r_out, start_deg, end_deg, deg_step_arc)
                inner = arc_points(cxi, cyi, r_in,  start_deg, end_deg, deg_step_arc)
                if len(outer) >= 2 and len(inner) >= 2:
                    poly = outer + list(reversed(inner))
                    pygame.draw.polygon(layer, color_rgba, poly)

            # Antall radielle bånd
            steps = max(1, int(r_span / 3)) if r_span > 0 else 1

            for i in range(steps, -1, -1):  # ytterst → innerst
                t = i / max(1, steps)           # 1 → ytterst, 0 → ved r_ok
                u = 1.0 - t                     # 0 ytterst, 1 ved r_ok

                r_out = r_ok + t * r_span
                r_in  = r_ok + (max(0, t - 1/steps)) * r_span
                if i == 0:
                    r_in = 0.0  # inkluder kjernen 0..r_ok i siste pass

                # Radial alfa (lerp outer→inner)
                innerG, outerG = alpha_g
                innerR, outerR = alpha_r
                aG_rad = max(0, min(255, int(outerG + (innerG - outerG) * u)))
                aR_rad = max(0, min(255, int(outerR + (innerR - outerR) * u)))

                # 1) Grønn sektor (±ang_ok), kun radial fade
                if ang_ok > 0 and aG_rad > 0:
                    ring_sector(int(r_in), int(r_out), a_ok_lo, a_ok_hi,
                                (col_g[0], col_g[1], col_g[2], aG_rad))

                # 2) Rød 'utenfor' med radial + ANGULÆR fade
                if ang_span > 0 and aR_rad > 0:
                    # venstre side: a_max_lo .. a_ok_lo (synkende vinkel)
                    a = a_max_lo
                    while a < a_ok_lo:
                        seg_end = min(a + deg_slice, a_ok_lo)
                        # angulær avstand fra grensen (0 ved a_ok_lo, → ang_span ved a_max_lo)
                        mid = (a + seg_end) * 0.5
                        dist_from_boundary = (a_ok_lo - mid)
                        t_ang = max(0.0, min(1.0, dist_from_boundary / max(1e-6, ang_span)))
                        a_slice = int(aR_rad * (1.0 - t_ang))  # opak ved grense → 0 ved ytterkant
                        if a_slice > 0:
                            ring_sector(int(r_in), int(r_out), a, seg_end,
                                        (col_r[0], col_r[1], col_r[2], a_slice))
                        a = seg_end

                    # høyre side: a_ok_hi .. a_max_hi (økende vinkel)
                    a = a_ok_hi
                    while a < a_max_hi:
                        seg_end = min(a + deg_slice, a_max_hi)
                        mid = (a + seg_end) * 0.5
                        dist_from_boundary = (mid - a_ok_hi)
                        t_ang = max(0.0, min(1.0, dist_from_boundary / max(1e-6, ang_span)))
                        a_slice = int(aR_rad * (1.0 - t_ang))
                        if a_slice > 0:
                            ring_sector(int(r_in), int(r_out), a, seg_end,
                                        (col_r[0], col_r[1], col_r[2], a_slice))
                        a = seg_end
        if not items:
            return
        # Tegn på egen Surface med alpha
        layer = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)


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
                heading = it.get("heading_deg", 90.0)  # 90° = ned
                draw_wedge(cx, cy,
                        heading_deg=heading,
                        ang_ok=it["ang_ok"], ang_span=it["ang_span"],
                        r_ok=it["r_ok"], r_span=it["r_span"])


        surf.blit(layer, (0, 0))


    def draw_window():
        # 1) Bakgrunn (snapshot)
        screen.blit(background_base, (0, 0))
        # 2) Halvtransparent mørk overlay
        screen.blit(overlay, (0, 0))
        # 2.5) Toleranseoverlays over den mørke filmen
        draw_tolerances_for_hint(hint_index)
        # 3) Vindu 
        rect = window_rect()
        pygame.draw.rect(screen, (245, 245, 245), rect, border_radius=16)
        pygame.draw.rect(screen, (80, 80, 80), rect, width=2, border_radius=16)

        # 4) Tittel
        title = font_title.render(f"{round(pct*100)} % riktig", True, color)
        t_rect = title.get_rect(center=(rect.centerx, rect.y + 40))
        screen.blit(title, t_rect)

        # 5) Hinttekst
        if lines:
            body = font_body.render(lines[hint_index], True, (30, 30, 30))
            b_rect = body.get_rect(center=(rect.centerx, rect.y + rect.h//2))
            screen.blit(body, b_rect)

        # 6) Hint-knapp (bare om det finnes flere linjer)
        if total_hints > 1:
            brect = button_rect()
            pygame.draw.rect(screen, (230, 230, 230), brect, border_radius=8)
            pygame.draw.rect(screen, (90, 90, 90), brect, width=2, border_radius=8)
            label_text = "Neste hint ➜" if hint_index < total_hints - 1 else "Ferdig"
            btn_label = font_btn.render(label_text, True, (10, 10, 10))
            l_rect = btn_label.get_rect(center=brect.center)
            screen.blit(btn_label, l_rect)

        pygame.display.flip()

    # Første tegn
    draw_window()

    # ---------- Event-loop (responsiv) ----------
    waiting = True
    while waiting:
        # Tidsstyrt løkke for responsivitet
        clock.tick(60)

        for e in pygame.event.get():
            if e.type == pygame.QUIT:
                pygame.quit()
                raise SystemExit

            if e.type == pygame.KEYDOWN:
                if e.key in (pygame.K_ESCAPE, pygame.K_RETURN):
                    # Lukk umiddelbart
                    waiting = False
                    break

            elif e.type == pygame.MOUSEBUTTONDOWN:
                mx, my = e.pos
                if window_rect().collidepoint(mx, my):
                    # Knapp?
                    if total_hints > 1 and button_rect().collidepoint(mx, my):
                        # Neste hint / ferdig → hvis siste, lukk
                        if hint_index < total_hints - 1:
                            hint_index += 1
                            draw_window()
                        else:
                            waiting = False
                            break
                    else:
                        # Start dragging
                        dragging = True
                        drag_off = (mx - box_x, my - box_y)
                else:
                    # Klikk utenfor => lukk umiddelbart
                    waiting = False
                    break

            elif e.type == pygame.MOUSEBUTTONUP:
                dragging = False

            elif e.type == pygame.MOUSEMOTION and dragging:
                mx, my = e.pos
                box_x = max(0, min(WIDTH - box_w, mx - drag_off[0]))
                box_y = max(0, min(HEIGHT - box_h, my - drag_off[1]))
                
                draw_window()
    # Lagre posisjon til neste gang
    _last_feedback_pos = (box_x, box_y)
    return

def draw_help_dialog(screen, title: str, lines: list[str]):
    """
    Fast dialog (ikke flyttbar), 80% x 80% av hovedvindu, ingen scroll.
    Vi antar at tekst er forhåndsbrutt (én liste-entry per linje).
    Lukkes med ESC eller klikk utenfor.
    """
    W, H = WIDTH, HEIGHT
    box_w, box_h = int(W * 0.80), int(H * 0.80)
    box_x = (W - box_w) // 2
    box_y = (H - box_h) // 2

    # Snapshot + mørk bakgrunn
    background_base = screen.copy()
    overlay = pygame.Surface((W, H), pygame.SRCALPHA)
    overlay.fill((20, 20, 20, 200))

    font_title = get_font(36)
    font_body  = get_font(24)

    # Tegn én gang, ingen scroll
    def draw():
        screen.blit(background_base, (0, 0))
        screen.blit(overlay, (0, 0))
        rect = pygame.Rect(box_x, box_y, box_w, box_h)
        pygame.draw.rect(screen, (245, 245, 245), rect, border_radius=16)
        pygame.draw.rect(screen, (80, 80, 80), rect, width=2, border_radius=16)

        # Tittel
        ts = font_title.render(title, True, (30, 30, 30))
        ts_rect = ts.get_rect(center=(rect.centerx, rect.y + 36))
        screen.blit(ts, ts_rect)

        # Tekstlinjer (uten wrapping)
        y = ts_rect.bottom + 16
        left = rect.x + 24
        right = rect.right - 24
        for line in lines or []:
            s = font_body.render(line, True, (30, 30, 30))
            r = s.get_rect()
            # venstrejustert, men hold deg innen marger; ingen scroll – klippes hvis for mye
            if r.width > (right - left):
                # klipp “hardt” hvis linja er bredere (valgfritt)
                pass
            screen.blit(s, (left, y))
            y += r.height + 8

        pygame.display.flip()

    draw()

    waiting = True
    clock = pygame.time.Clock()
    while waiting:
        clock.tick(60)
        for e in pygame.event.get():
            if e.type == pygame.QUIT:
                pygame.quit()
                raise SystemExit
            if e.type == pygame.KEYDOWN and e.key == pygame.K_ESCAPE:
                waiting = False
                break
            if e.type == pygame.MOUSEBUTTONDOWN:
                if not pygame.Rect(box_x, box_y, box_w, box_h).collidepoint(e.pos):
                    waiting = False
                    break

# ui/dialogs.py (legg til nederst)

def draw_live_feedback(screen, pct: float, lines: list[str], *,
                       top_right: tuple[int, int] = None,
                       max_width: int = 320,
                       max_lines: int = 6,
                       overlays: list[dict] = None):
    """
    Enkel live-HUD (ikke-modal): prosent + noen hintlinjer + global overlays.
    - Ingen interaksjon; tegnes bare når du kaller den.
    - "lines" forventes å være korte meldinger (samme som fra check_*).
    - "overlays" er liste med overlay-dict som skal tegnes (global overlays fra evaluate_task)
    """
    import pygame
    from utils.settings import TEXT_COLOR, get_font

    if top_right is None:
        # litt margin fra høyre kant
        W = screen.get_width()
        H = screen.get_height()
        bottom_right = (W - 16, H - 16)
    else:
        # bruk gitt top_right (høyre hjørne) som referanse
        bottom_right = top_right

    # Tegn global overlays først (under HUD-boksen)
    if overlays:
        def draw_circle(layer, cx, cy, r_ok, r_span):
            # 100%-område (lysegrønt, fylt)
            pygame.draw.circle(layer, (80, 200, 80, 90), (int(cx), int(cy)), int(r_ok))
            # Overgangsområde: tynn, semitransparent ring (lyserødt mot 0%)
            for r in range(int(r_ok), int(r_ok + r_span) + 1, 2):
                t = (1.0-(r - r_ok) / max(1, r_span))  # 0..1
                col = (220, 60, 60, int(30 + 90 * t))
                pygame.draw.circle(layer, col, (int(cx), int(cy)), r, width=2)

        def draw_stadium(layer, ax, ay, bx, by, r_ok, r_span):
            """
            Stadium/kapsel langs A→B med halvsirkler i endene.
            A(ax,ay) og B(bx,by) er *sentrene* i halvsirklene.
            - r_ok:  fylt 100%-bånd (grønt)
            - r_span: tykkelse på overgangsbåndet (røde ringer utenpå)
            Sømløs utfylling og kontur (ett sammenhengende polygon pr. bånd).
            """
            import math

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

            # Tegn fylt kapsel (100%-bånd)
            poly_ok = capsule_outline(A, B, r_ok, deg_step=4)  # tettere sampling = jevnere halvsirkel
            pygame.draw.polygon(layer, (80, 200, 80, 90), poly_ok)

            # Tegn konsentriske ring-bånd utenpå (sømløs polygon mellom r_in og r_out)
            if r_span > 0:
                step = 2
                for dr in range(0, int(r_span) + 1, step):
                    r_out = r_ok + dr
                    r_in  = max(0, r_out - 2)  # ~2 px tykk ring
                    t = 1.0 - (dr / max(1, r_span))
                    alpha = int(30 + 90 * t)   # fade som før

                    outer = capsule_outline(A, B, r_out, deg_step=6)
                    inner = capsule_outline(A, B, r_in,  deg_step=6)
                    if len(outer) >= 3 and len(inner) >= 3:
                        ring_poly = outer + list(reversed(inner))
                        pygame.draw.polygon(layer, (220, 60, 60, alpha), ring_poly)

        overlay_layer = pygame.Surface((screen.get_width(), screen.get_height()), pygame.SRCALPHA)
        for it in overlays:
            t = it.get("type")
            if t == "circle":
                cx, cy = it["center"]
                draw_circle(overlay_layer, cx, cy, it["r_ok"], it["r_span"])
            elif t == "stadium":
                (ax, ay) = it["a"]
                (bx, by) = it["b"]
                draw_stadium(overlay_layer, ax, ay, bx, by, it["r_ok"], it["r_span"])

        screen.blit(overlay_layer, (0, 0))

    # Velg små fonter
    font_title = get_font(18)
    font_body  = get_font(14)

    # Bygg tekstrader (klipp til max_lines)
    title = f"{round(pct*100)} % riktig"
    body_lines = (lines or [])[:max_lines]

    # Mål opp bredde/høyde
    title_surf = font_title.render(title, True, (20,20,20))
    line_surfs = [font_body.render(s, True, (40,40,40)) for s in body_lines]

    inner_w = min(max(title_surf.get_width(),
                      *(ls.get_width() for ls in line_surfs) if line_surfs else [0]),
                  max_width - 24)
    inner_h = title_surf.get_height() + 8 + sum(ls.get_height() + 4 for ls in line_surfs)

    pad  = 10
    box_w = inner_w + 2*pad
    box_h = inner_h + 2*pad

    # Plasser rektangel med høyre kant forankret i top_right
    box_x = bottom_right[0] - box_w
    box_y = bottom_right[1] - box_h
    rect = pygame.Rect(box_x, box_y, box_w, box_h)

    # Bakgrunn
    bg = pygame.Surface((box_w, box_h), pygame.SRCALPHA)
    bg.fill((245, 245, 245, 230))
    pygame.draw.rect(bg, (100,100,100), bg.get_rect(), width=1, border_radius=8)

    # Farge for tittel basert på pct (samme logikk som show_feedback)
    color = (0, 160, 0) if pct >= 0.8 else (200, 150, 0) if pct >= 0.5 else (200, 50, 50)
    title_surf_colored = font_title.render(title, True, color)

    # Blit boksen
    screen.blit(bg, (box_x, box_y))

    # Tegn tekst
    cx = box_x + pad
    cy = box_y + pad
    screen.blit(title_surf_colored, (cx, cy))
    cy += title_surf.get_height() + 8

    for ls in line_surfs:
        # Hard klipp i bredde (ingen wrapping for enkelhet)
        if ls.get_width() > inner_w:
            # klipp-surface
            crop = pygame.Surface((inner_w, ls.get_height()), pygame.SRCALPHA)
            crop.blit(ls, (0,0))
            screen.blit(crop, (cx, cy))
        else:
            screen.blit(ls, (cx, cy))
        cy += ls.get_height() + 4
