import pygame
import math
import utils.geometry as vec

class Plane:
    def __init__(self, pivotpoint ,angle_deg, friction,color=(40,40,40), thickness=2):
        self.pivotpoint = pivotpoint
        self.angle_deg = angle_deg
        self.p_vec, self.n_vec = vec.np_axes(angle_deg)
        if self.n_vec[1] > 0:
            self.n_vec = (self.n_vec[0], self.n_vec[1]) # pek "oppover" i skjerm-koord

        self.friction = friction
        self.color = color
        self.thickness = thickness
        
    def draw(self, surf):
        w, h = surf.get_size()
        x0, y0 = self.pivotpoint

        # Vinkel i radianer. Skjerm-koord: y øker nedover -> dy = -sin(theta)
        theta = math.radians(self.angle_deg)
        dx = math.cos(theta)
        dy = -math.sin(theta)

        eps = 1e-9
        candidates = []

        # Skjæringer med venstre/høyre kant (x = 0 og x = w)
        if abs(dx) > eps:
            t = (0 - x0) / dx
            y = y0 + t * dy
            if 0 <= y <= h:
                candidates.append((0, int(round(y))))

            t = (w - x0) / dx
            y = y0 + t * dy
            if 0 <= y <= h:
                candidates.append((w, int(round(y))))

        # Skjæringer med topp/bunn (y = 0 og y = h)
        if abs(dy) > eps:
            t = (0 - y0) / dy
            x = x0 + t * dx
            if 0 <= x <= w:
                candidates.append((int(round(x)), 0))

            t = (h - y0) / dy
            x = x0 + t * dx
            if 0 <= x <= w:
                candidates.append((int(round(x)), h))

        # Velg to punkter som er lengst fra hverandre (sikrer hele bredden/høyden)
        if len(candidates) >= 2:
            if len(candidates) > 2:
                best_i, best_j, best_d = 0, 1, -1
                for i in range(len(candidates)):
                    for j in range(i + 1, len(candidates)):
                        xi, yi = candidates[i]
                        xj, yj = candidates[j]
                        d = (xi - xj) ** 2 + (yi - yj) ** 2
                        if d > best_d:
                            best_i, best_j, best_d = i, j, d
                start_pos, end_pos = candidates[best_i], candidates[best_j]
            else:
                start_pos, end_pos = candidates[0], candidates[1]
        else:
            # Fallback: horisontal linje gjennom pivot (hvis noe numerisk rart skulle skje)
            start_pos = (0, max(0, min(h, int(round(y0)))))
            end_pos   = (w, max(0, min(h, int(round(y0)))))

        pygame.draw.line(surf, self.color, start_pos, end_pos, self.thickness)
    def get_normal_vector(self):
        angle_rad = math.radians(self.angle_deg + 90)
        return (math.cos(angle_rad), math.sin(angle_rad))
    
def _normalize(vx, vy, eps=1e-12):
    """Returner enhetsvektor og flagg for om normalisering var vellykket."""
    mag = math.hypot(vx, vy)
    if mag < eps:
        return (0.0, -1.0), False  # Fallback: pek opp i skjerm (y- ned), dvs. “oppover”
    return (vx / mag, vy / mag), True

class RectBody:
    def __init__(self,bottom_center,width, height, normal_vector=(0.0, 1.0), friction=0.0,
                 color=(150, 75, 0), thickness=2):
        self.bottom_center = tuple(bottom_center)
        self.width = width
        self.height = height
        self.friction = friction
        self.color = color
        self.thickness = thickness

        # Normal og tangent
        (nx, ny), _ = _normalize(normal_vector[0], normal_vector[1])
        self.normal_vector = (nx, ny)
        tx, ty = -ny, nx  # tangent vinkelrett på normal

        # Vinkelinfo (for referanse)
        angle_rad = math.atan2(ty, tx)
        angle_deg = (math.degrees(angle_rad) + 360.0) % 360.0
        self.angle_rad = angle_rad
        self.angle_deg = angle_deg

        # Geometri
        bcx, bcy = self.bottom_center
        half_w = 0.5 * width

        # Nederste kant (p1 venstre-bunn, p2 høyre-bunn sett langs tangent)
        p1x = bcx - tx * half_w
        p1y = bcy - ty * half_w
        p2x = bcx + tx * half_w
        p2y = bcy + ty * half_w

        # Topp-kant offset (oppover = motsatt normal)
        offx = nx * height
        offy = ny * height

        # Øvre kant (p3 høyre-topp, p4 venstre-topp)
        p3x = p2x + offx
        p3y = p2y + offy
        p4x = p1x + offx
        p4y = p1y + offy

        self.x1, self.y1 = p1x, p1y
        self.x2, self.y2 = p2x, p2y
        self.x3, self.y3 = p3x, p3y
        self.x4, self.y4 = p4x, p4y

        # Snappoints: hjørner, midtpunkter, senter og bottom_center
        # Hjørner
        c1 = (p1x, p1y)  # left_bottom
        c2 = (p2x, p2y)  # right_bottom
        c3 = (p3x, p3y)  # right_top
        c4 = (p4x, p4y)  # left_top

        # Midtpunkter
        mid_bottom = ((p1x + p2x) * 0.5, (p1y + p2y) * 0.5)
        mid_top    = ((p3x + p4x) * 0.5, (p3y + p4y) * 0.5)
        mid_left   = ((p1x + p4x) * 0.5, (p1y + p4y) * 0.5)
        mid_right  = ((p2x + p3x) * 0.5, (p2y + p3y) * 0.5)

        # Senter av rektangelet
        self.center = ((c1[0] + c3[0]) * 0.5, (c1[1] + c3[1]) * 0.5)

        self.labelpos = (c4[0] + 4, c4[1] + 4)  # nederst venstre hjørne + litt padding
        #(cx - self.A_w/2 + pad, cy + self.A_h/2 - 20 - pad)

        self.snappoints = {
            "left_bottom": c1,
            "right_bottom": c2,
            "right_top": c3,
            "left_top": c4,
            "mid_bottom": mid_bottom,
            "mid_top": mid_top,
            "mid_left": mid_left,
            "mid_right": mid_right,
            "center": self.center,
            "bottom_center": (bcx, bcy),
        }

    def get_snap_points(self):
        return list(self.snappoints.values())
    
    def draw(self, surf):
        points = [(self.x1, self.y1),
                  (self.x2, self.y2),
                  (self.x3, self.y3),
                  (self.x4, self.y4)]
        pygame.draw.polygon(surf, self.color, points, self.thickness)

    