# engine/snapping.py
import math

def _angle_diff_deg(a: float, b: float) -> float:
    """Minste vinkelavvik i grader i [0, 180]."""
    return abs((a - b + 180.0) % 360.0 - 180.0)

def snap_point(
    pos,                # (x,y)
    plane_angle_deg,    # grader
    step,               # px
    origin,             # (ox,oy) - bruk kraftens lokale origin (A)
    *,
    mode="xy",          # "xy" eller "np"
    snap_on=True,
):
    if not snap_on:
        return pos

    px, py = pos
    ox, oy = origin

    if mode == "np":
        a = math.radians(plane_angle_deg)
        dx, dy = pos[0] - origin[0], pos[1] - origin[1]

        # Samme basis som i tegningen (skjerm y ned → ty = -sin)
        tx, ty = math.cos(a), -math.sin(a)  # tangent langs planet
        nx, ny = -ty, tx                    # normal vinkelrett på planet

        # Prosjiser posisjon inn i (t,n)-koordinater
        xr = dx * tx + dy * ty   # komponent langs planet
        yr = dx * nx + dy * ny   # komponent normalt på planet

        # Snapp i lokalbasis (rund av til nærmeste rutenettsteg)
        xr = round(xr / step) * step
        yr = round(yr / step) * step

        # Transformér tilbake til skjermkoordinater
        sx = origin[0] + xr * tx + yr * nx
        sy = origin[1] + xr * ty + yr * ny
        return (sx, sy)
    # mode == "xy"
    gx = round((px - ox) / step) * step
    gy = round((py - oy) / step) * step
    return (ox + gx, oy + gy)



def snap_to_block_points(
    pos: tuple[float, float],
    block_points: dict | list | None,
    *,
    snap_on: bool = True,
    snap_radius: float = 20.0,
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
    best_d2 = (snap_radius + 1.0) ** 2

    for (bx, by) in pts:
        d2 = (px - bx) ** 2 + (py - by) ** 2
        if d2 < best_d2:
            best = (bx, by)
            best_d2 = d2

    return best
