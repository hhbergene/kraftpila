# utils/geometry.py
from typing import Tuple,TypeAlias
import math

Vec2d: TypeAlias = Tuple[float, float]

def vec(p: Vec2d, q: Vec2d) -> Vec2d:
    return (q[0]-p[0], q[1]-p[1])

def unit(v: Vec2d) -> Vec2d:
    n = math.hypot(v[0], v[1])
    if n < 1e-9:
        return (0.0, 0.0)
    return (v[0]/n, v[1]/n)

def rot_deg(v: Vec2d, angle_deg: float) -> Vec2d:
    """Roter vektor v med angle_deg grader (mot klokka)."""
    a = math.radians(angle_deg)
    c = math.cos(a)
    s = math.sin(a)
    x_new = v[0]*c - v[1]*s
    y_new = v[0]*s + v[1]*c
    return (x_new, y_new)

def add(a: Vec2d, b: Vec2d) -> Vec2d:
    # Vektor addisjon
    return (a[0]+b[0], a[1]+b[1])

def sub(a: Vec2d, b: Vec2d) -> Vec2d:
    # Vektor subtraksjon
    return (a[0]-b[0], a[1]-b[1])

def scale(a: Vec2d, s: float) -> Vec2d:
    # Skalering av vektor
    return (a[0]*s, a[1]*s)

def dot(a: Vec2d, b: Vec2d) -> float:
    # Skalarprodukt
    return a[0]*b[0] + a[1]*b[1]

def cross2(a: Vec2d, b: Vec2d) -> float:
    # 2D «z»-komponenten (orientering/side)
    return a[0]*b[1] - a[1]*b[0]

def norm(a: Vec2d) -> float:
    return math.hypot(a[0], a[1])

def normalize(a: Vec2d, eps: float = 1e-3) -> Vec2d:
    # Returner enhetsvektor (0,0 hvis for liten)
    n = norm(a)
    return (a[0]/n, a[1]/n) if n > eps else (0.0, 0.0)

def distance(p: Vec2d, q: Vec2d) -> float:
    return math.hypot(p[0]-q[0], p[1]-q[1])

def perp(a: Vec2d) -> Vec2d:
    return (-a[1], a[0])

def project(a: Vec2d, onto: Vec2d) -> Vec2d:
    u = normalize(onto)
    k = dot(a, u)
    return (u[0]*k, u[1]*k)

def angle_between_deg(a: Vec2d, b: Vec2d, eps: float = 1e-9) -> float:
    na, nb = norm(a), norm(b)
    if na < eps or nb < eps: return float("inf")
    c = max(-1.0, min(1.0, dot(a, b)/(na*nb)))
    return abs(math.degrees(math.acos(c)))

def np_axes(angle_deg: float) -> tuple[Vec2d, Vec2d]:
    a = math.radians(angle_deg)
    t = (math.cos(a), -math.sin(a))  # tangent langs planet (y peker ned)
    n = (-t[1], -t[0])               # normal på planet (oppover i pygame)
    return t, n

def uvec_from_deg(angle_deg: float) -> Vec2d:
    """Create a unit vector pointing at angle_deg (degrees, counter-clockwise from +x axis)."""
    a = math.radians(angle_deg)
    return (math.cos(a), math.sin(a))

# def point_to_segment_distance(P, A, B):
#     """Minste avstand fra punkt P til linjesegment A-B."""
#     if A is None or B is None:
#         return 1e9
#     ab = sub(B, A)
#     ab2 = dot(ab, ab)
#     if ab2 == 0:
#         return dist(P, A)
#     t = max(0.0, min(1.0, dot(sub(P, A), ab) / ab2))
#     proj = (A[0] + t*ab[0], A[1] + t*ab[1])
#     return dist(P, proj)

def dist_point_to_segment(p, a, b):
    """Alias brukt i scoring_utils (samme som over, men uten None-sjekk)."""
    ab = sub(b, a)
    ab2 = dot(ab, ab)
    if ab2 == 0:
        return distance(p, a)
    t = max(0.0, min(1.0, dot(sub(p, a), ab) / ab2))
    proj = (a[0] + t*ab[0], a[1] + t*ab[1])
    return distance(p, proj)

# def dist_segment_to_segment(a1, a2, b1, b2):
#     """Rimelig robust min-avstand mellom to segmenter i 2D."""
#     d1 = dist_point_to_segment(a1, b1, b2)
#     d2 = dist_point_to_segment(a2, b1, b2)
#     d3 = dist_point_to_segment(b1, a1, a2)
#     d4 = dist_point_to_segment(b2, a1, a2)
#     return min(d1, d2, d3, d4)


#Ctrl + K,C to comment block
# # --- vektoroperasjoner ---
# def add(p, q): return (p[0] + q[0], p[1] + q[1])
# def sub(p, q): return (p[0] - q[0], p[1] - q[1])
# def dist(p, q): return math.hypot(p[0] - q[0], p[1] - q[1])

# def dot(a, b): return a[0]*b[0] + a[1]*b[1]
# def norm(v):   return math.hypot(v[0], v[1])

# def normalize(v, eps=1e-6):
#     n = norm(v)
#     if n < eps:
#         return (0.0, 0.0)
#     return (v[0]/n, v[1]/n)

# def perp(v):
#     """90° rotasjon (x, y) -> (-y, x)"""
#     return (-v[1], v[0])

# # --- vinkler ---
# def angle_deg(v):
#     """Absolutt vinkel (0..180) mot x-aksen, uten fortegn."""
#     a = math.degrees(math.atan2(v[1], v[0]))
#     a = abs((a + 360) % 360)
#     return a if a <= 180 else 360 - a

# def angle_diff_deg(v1, v2):
#     """Minste vinkelavvik (0..180) mellom v1 og v2."""
#     a1 = math.degrees(math.atan2(v1[1], v1[0]))
#     a2 = math.degrees(math.atan2(v2[1], v2[0]))
#     return abs(((a1 - a2 + 180) % 360) - 180)

# # --- projeksjoner / avstander ---
# def proj_point_on_line(p, a, b):
#     """Projiser punkt p på uendelig linje gjennom a->b."""
#     ab = sub(b, a)
#     ab2 = dot(ab, ab)
#     if ab2 == 0:
#         return a
#     t = dot(sub(p, a), ab) / ab2
#     return (a[0] + t*ab[0], a[1] + t*ab[1])

# def offset_from(v, length):
#     """Unit(v) * length (returnerer (0,0) hvis v≈0)."""
#     u = normalize(v)
#     return (u[0]*length, u[1]*length)
