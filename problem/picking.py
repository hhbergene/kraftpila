# ./problem/picking.py
from __future__ import annotations
from typing import Dict, Iterable, List, Optional, Sequence, Tuple
import math

from .spec import ForceSpec, TaskSpec, Vec2
from utils.geometry import vec  # du nevnte denne eksisterer

# ----------------------------
# Konstanter for plukklogikk
# ----------------------------

# Maks akseptabel vinkel (grader) for å matche en navnløs kraft mot en forventet retning
ASSUME_ANGLE_DEG = 35.0

# Når vi rangerer kandidater med ~samme vinkelavvik, hvor stor vinkel regnes som "lik" (for tie-breaks)
ANGLE_TIE_EPS_DEG = 1.0


# ----------------------------
# Grunnleggende vektorhjelp
# ----------------------------

def _safe_unit(v: Vec2) -> Vec2:
    n = vec.norm(v)
    if n == 0.0:
        return (0.0, 0.0)
    return (v[0] / n, v[1] / n)

def _angle_error_deg(v: Vec2, target_unit: Vec2) -> float:
    u = _safe_unit(v)
    t = _safe_unit(target_unit)
    # clamp dot for numerikk
    d = max(-1.0, min(1.0, vec.dot(u, t)))
    # vinkel mellom (0..pi), konverter til grader
    ang = math.degrees(math.acos(d))
    return ang

def _name_in_aliases(name: Optional[str], aliases: Iterable[str]) -> bool:
    if not name:
        return False
    return name.strip().lower() in aliases


# ----------------------------
# Typer
# ----------------------------

# En "ForceLike" forventes å ha .name (str|None) og .vec (Vec2),
# og typisk .A (angrepspunkt) – men picking bruker kun .name og .vec.
class ForceLike:
    name: Optional[str]
    vec: Vec2


# ----------------------------
# Kandidatrangering
# ----------------------------

def _rank_candidates_by_direction(
    forces: Sequence[ForceLike],
    target_unit: Vec2,
) -> List[Tuple[float, int, ForceLike]]:
    """
    Returnerer liste sortert etter (vinkelavvik, -|vec|, index) for stabile valg.
    - lavest vinkel først
    - ved ~samme vinkel: størst magnitude foretrekkes
    - index (stabil sort)
    """
    ranked: List[Tuple[float, int, ForceLike]] = []
    for i, f in enumerate(forces):
        ang = _angle_error_deg(f.vec, target_unit)
        mag = vec.norm(f.vec)
        # vi vil ha størst mag -> sortere på -mag, men mag er float; vi kan pakke om
        ranked.append((ang, -int(mag * 1000.0), f))
    ranked.sort(key=lambda t: (t[0], t[1]))
    return ranked


def _best_named_match(
    forces: Sequence[ForceLike],
    spec: ForceSpec,
) -> Optional[Tuple[ForceLike, float]]:
    named = [f for f in forces if _name_in_aliases(getattr(f, "name", None), spec.aliases)]
    if not named:
        return None
    ranked = _rank_candidates_by_direction(named, spec.dir_unit)
    best = ranked[0]
    return (best[2], best[0])


def _best_unnamed_match(
    forces: Sequence[ForceLike],
    spec: ForceSpec,
    max_angle_deg: float,
) -> Optional[Tuple[ForceLike, float]]:
    # Filtrer på retningsnærhet
    close = [f for f in forces if _angle_error_deg(f.vec, spec.dir_unit) <= max_angle_deg]
    if not close:
        return None
    ranked = _rank_candidates_by_direction(close, spec.dir_unit)
    best = ranked[0]
    return (best[2], best[0])


# ----------------------------
# Hoved-API
# ----------------------------

def pick_forces(
    drawn_forces: Sequence[ForceLike],
    expected_specs: Sequence[ForceSpec],
    *,
    max_unnamed_angle_deg: float = ASSUME_ANGLE_DEG,
) -> Dict[str, Tuple[ForceLike, float]]:
    """
    Tildeler hver forventet kraft (ForceSpec) én unik pil fra 'drawn_forces'.

    Strategi:
      1) Sortér spesifikasjoner på stigende pick_priority (lavest = først).
      2) For hver spec:
         a) Forsøk å finne beste "navngitte" kandidat (alias-treff) med minst vinkelavvik.
         b) Hvis ingen navn, plukk beste navneløse kandidat innen 'max_unnamed_angle_deg'.
      3) Når en pil er plukket til en spec, fjernes den fra videre vurdering (unik tildeling).
      4) Returnerer dict: {spec.key: (force_obj, angle_error_deg)}

    Merk:
    - Ingen try/hasattr – vi forventer at kraftobjektene har .name og .vec.
    - Dersom ingen kandidat finnes for en spec, utelates den fra retur-dict.
    """
    # Arbeidskopi av tilgjengelige piler
    remaining: List[ForceLike] = list(drawn_forces)

    # Sorter spesifikasjoner på prioritet
    ordering = sorted(expected_specs, key=lambda s: s.pick_priority)

    picked: Dict[str, Tuple[ForceLike, float]] = {}

    for spec in ordering:
        if not remaining:
            break

        # 1) forsøk navngitt match
        named = _best_named_match(remaining, spec)

        if named is not None:
            chosen, ang = named
            picked[spec.key] = (chosen, ang)
            # fjern valgt pil
            remaining = [f for f in remaining if f is not chosen]
            continue

        # 2) forsøk navneløs på retningsnærhet
        unnamed = _best_unnamed_match(remaining, spec, max_angle_deg=max_unnamed_angle_deg)
        if unnamed is not None:
            chosen, ang = unnamed
            picked[spec.key] = (chosen, ang)
            remaining = [f for f in remaining if f is not chosen]
            continue

        # 3) ingen kandidat – hopp over (ingen oppføring i picked for denne spec)
        # evaluering kan gi "mangler <navn>"-feedback senere

    return picked

# problem/picking.py – legg til/hold disse hjelpefunksjonene

def parse_ref(ref: str) -> tuple[str, int]:
    t, idx = ref.split(":")
    return t.strip(), int(idx)

def resolve_ref(scene, ref: str):
    t, i = parse_ref(ref)
    if t == "rect":
        return scene.rects[i]
    if t == "circle":
        return scene.circles[i]
    if t == "plane":
        return scene.plane
    raise ValueError(f"Ukjent ref-type: {t}")

def resolve_anchor(scene, anchor_spec):
    """
    Støtter:
      - point + ref + point_name   (f.eks. center, top_center, bottom_center, ...)
      - segment + ref + segment_name (f.eks. bottom, top, left, right)
      - point + point (rå koordinat) når ref=None
    """
    if anchor_spec.kind == "point":
        if anchor_spec.ref:
            shape = resolve_ref(scene, anchor_spec.ref)
            return shape.get_point(anchor_spec.point_name)  # må finnes på RectSpec/CircleSpec
        return anchor_spec.point
    elif anchor_spec.kind == "segment":
        shape = resolve_ref(scene, anchor_spec.ref)
        return shape.get_segment(anchor_spec.segment_name)   # tuple[(x1,y1),(x2,y2)]
    else:
        raise ValueError("AnchorSpec.kind må være 'point' eller 'segment'")
