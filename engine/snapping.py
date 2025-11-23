# engine/snapping.py
import utils.geometry as vec
import math

global DEBUG_snap_candidates
DEBUG_snap_candidates = []
delta2 = 500.0

def snap_point(
    pos,                # (x,y)
    plane_angle_deg,    # grader
    step,               # px
    origin,             # (ox,oy)
    *,
    snap_on=True,
    snap_points=None,   # dict | list | None – block_points
) -> tuple[float, float]:
   
    if not snap_on:
        return pos

    # Build candidate points and find closest to pos
    snap_candidates = []
    best_point = origin
    # Prøv først å snappe til definerte block_points (hjørner/kanter/senter)
    if snap_points:
        block_point = snap_to_block_points(pos, snap_points, snap_on=True)
        best_point = block_point

    px, py = pos
    ox, oy = origin

    # Snap to XY grid through origin
    snapped_x = round((px - ox) / step) * step + ox
    snapped_y = round((py - oy) / step) * step + oy

    if plane_angle_deg != 0.0:

    
        # Get tangent/normal vectors for the plane through origin
        t, n = vec.np_axes(plane_angle_deg)
        
        x1 = vec.x_on_line(snapped_y, origin, n)
        snap_candidates.append((x1, snapped_y))  # Snap to line parallel to normal

        y2 = vec.y_on_line(snapped_x, origin, n)
        snap_candidates.append((snapped_x, y2))  # Snap to line parallel to normal

        x3 = vec.x_on_line(snapped_y, origin, t)
        snap_candidates.append((x3, snapped_y))  # Snap to line parallel to tangent

        y4 = vec.y_on_line(snapped_x, origin, t)
        snap_candidates.append((snapped_x, y4))  # Snap to line parallel to tangent
    
    best_d2 = (px - best_point[0]) ** 2 + (py - best_point[1]) ** 2  
    for candidate_point in snap_candidates:
        cx, cy = candidate_point
        d2 = (px - cx) ** 2 + (py - cy) ** 2
        if d2 < best_d2:
            best_point = candidate_point
            best_d2 = d2

    snap_candidates.append(best_point)
    # Check if closest point is actually closer than XY grid snap
    xyd2 = (px - snapped_x) ** 2 + (py - snapped_y) ** 2
    if best_d2 > xyd2 and best_d2 > step**2:
        best_d2 = xyd2
        best_point = (snapped_x, snapped_y)

    # Hvis vi snappet til block point, sjekk om det er nærmere enn beste np_point
    if snap_points and block_point:
        snap_candidates.append(block_point)
        bx, by = block_point
        bd2 = (px - bx) ** 2 + (py - by) ** 2
        if bd2 < best_d2+delta2  :
            best_point = block_point

    global DEBUG_snap_candidates
    DEBUG_snap_candidates = snap_candidates

    return best_point

def DEBUG_snap_points() -> list[tuple[float, float]]:

    return DEBUG_snap_candidates



def snap_to_block_points(
    pos: tuple[float, float],
    block_points: dict | list | None,
    *,
    snap_on: bool = True,
) -> tuple[float, float] | None:
    """
    Snapp til klosspunkter (hjørner/kantmidter/senter) hvis nær nok.
    - block_points kan være:
        * dict med nøkler "corners", "edges", "center" (hver en liste av (x,y))
        * eller en flat liste [(x,y), ...]
    - Returnerer (x,y) hvis treff, ellers None.
    """
    if not snap_on or not block_points:
        return None

    # Pakk ut alle punkter i én liste
    pts: list[tuple[float, float]] = []
    if isinstance(block_points, dict):
        # Prioritet: hjørner → kanter → senter
        for key in ("corners", "edges", "center"):
            pts.extend(block_points.get(key, []))
    elif isinstance(block_points, (list, tuple)):
        pts = list(block_points)

    if not pts:
        return None

    px, py = pos
    best = None
    best_d2 = 1e9 # stor avstand

    for (bx, by) in pts:
        d2 = (px - bx) ** 2 + (py - by) ** 2
        if d2 < best_d2:
            best = (bx, by)
            best_d2 = d2

    return best
