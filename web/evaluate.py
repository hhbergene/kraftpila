# ./problem/evaluate.py
from __future__ import annotations
from typing import Dict, Iterable, List, Optional, Sequence, Tuple, Union
import math

import utils.geometry as vec  # ditt eksisterende vektor-API
from problem.spec import TaskSpec, AnchorType, Tolerances


from utils.settings import GRID_STEP
from engine.forces import normalize_name

Vec2 = Tuple[float, float]
# Scoring configuration constants
NAME_MISMATCH_PENALTY = 0.5  # Penalty multiplier if force name doesn't match expected
COVERAGE_PENALTY_EXP = 1.5   # Exponent for coverage penalty (reduces score if forces are missing)

# ------------------------------------------------------
# Grunnleggende numerikk
# ------------------------------------------------------

def clamp(x: float, lo: float, hi: float) -> float:
    return lo if x < lo else (hi if x > hi else x)

def ramp_down_linear(value: float, tol: float, span: float) -> float:
    """
    Skår i [0,1] der |value| <= tol gir 1.0, og faller lineært til 0.0 ved |value| >= tol+span.
    """
    a = abs(value)
    if a <= tol:
        return 1.0
    if span <= 0.0:
        return 0.0
    return clamp(1.0 - (a - tol) / span, 0.0, 1.0)

def deg2rad(a: float) -> float:
    return a * math.pi / 180.0

def rotate(v: Vec2, angle_deg: float) -> Vec2:
    if angle_deg == 0.0:
        return v
    a = deg2rad(angle_deg)
    c, s = math.cos(a), math.sin(a)
    return (c * v[0] - s * v[1], s * v[0] + c * v[1])

def unit(v: Vec2) -> Vec2:
    if v is None or (isinstance(v, tuple) and len(v) != 2):
        return (0.0, 0.0)
    try:
        n = vec.norm(v)
        if n == 0.0 or n < 1e-9:
            return (0.0, 0.0)
        return (v[0] / n, v[1] / n)
    except (TypeError, AttributeError, ValueError):
        return (0.0, 0.0)

def angle_error_deg(v: Vec2, target_unit: Vec2) -> float:
    u = unit(v)
    t = unit(target_unit)
    # Guard against zero vectors
    if u == (0.0, 0.0) or t == (0.0, 0.0):
        return 180.0  # Max error if either vector is invalid
    d = clamp(vec.dot(u, t), -1.0, 1.0)
    return math.degrees(math.acos(d))

# ------------------------------------------------------
# Sum av krefter og komponenter
# ------------------------------------------------------

def sumF(
    forces: Sequence[object],
    basis: str = "xy",
    *,
    n_vec: Optional[Vec2] = None,
    angle_deg: float = 0.0,
) -> Tuple[Vec2, float, float]:
    """
    Returnerer:
      total_vec, c1, c2

    - basis="xy": (c1, c2) = komponenter i et xy-system som kan være rotert med angle_deg.
      angle_deg roterer koordinataksene slik at du kan måle komponenter i en ønsket akseretning
      (vi projiserer total på e_x' og e_y' der systemet er rotert med angle_deg).

    - basis="np": (c1, c2) = (normal, tangens) med gitt n_vec (normal opp fra plan),
      c1 = dot(total, e_n), c2 = dot(total, e_p), der e_p = (-e_n.y, e_n.x).
    """
    total = (0.0, 0.0)
    for f in forces:
        total = vec.add(total, f.vec)

    if basis == "xy":
        # komponenter i rotert xy (e_x', e_y')
        # projeksjon = rotér vektor motsatt vei, og les av x,y
        # ekvivalent: c1 = dot(total, e_x'), c2 = dot(total, e_y')
        v_local = rotate(total, -angle_deg)
        return total, v_local[0], v_local[1]

    elif basis == "np":
        if n_vec is None:
            raise ValueError("sumF(basis='np') krever n_vec")
        e_n = unit(n_vec)
        if e_n == (0.0, 0.0):
            raise ValueError("sumF(basis='np'): n_vec cannot be zero vector")
        e_p = (-e_n[1], e_n[0])
        return total, vec.dot(total, e_n), vec.dot(total, e_p)

    else:
        raise ValueError(f"Ukjent basis: {basis}")

def sumF_score(
    forces: Sequence[object],
    *,
    basis: str = "xy",
    n_vec: Optional[Vec2] = None,
    angle_deg: float = 0.0,
    tol: float = 0.5,
    span: float = 2.0,
    mode: str = "both",
) -> Tuple[float, Vec2, Tuple[float, float]]:
    """
    Skårer likevektskrav for kraftsum.

    mode:
      - "both": bruk norm(c1, c2)
      - "c1"  : bruk bare |c1|  (f.eks. bare normal-komponent)
      - "c2"  : bruk bare |c2|  (f.eks. bare tangens-komponent)

    Returnerer: (score, total_vec, (c1, c2))
    """
    total, c1, c2 = sumF(forces, basis=basis, n_vec=n_vec, angle_deg=angle_deg)

    if mode == "both":
        res = math.hypot(c1, c2)
    elif mode == "c1":
        res = abs(c1)
    elif mode == "c2":
        res = abs(c2)
    else:
        raise ValueError(f"Ukjent mode: {mode}")

    score = ramp_down_linear(res, tol, span)
    return score, total, (c1, c2)

# ------------------------------------------------------
# Skåring: navn, retning, posisjon, dekning
# ------------------------------------------------------

def name_matches(name: Optional[str], aliases: Iterable[str]) -> bool:
    if not name:
        return False
    n = normalize_name(name)
    return n in {normalize_name(a) for a in aliases}

def score_name(force, *, aliases: Iterable[str], weight: float) -> Tuple[float, float]:
    ok = 1.0 if name_matches(force.name, aliases) else 0.0
    return weight * ok, weight

def score_direction(force, *, expected_dir_unit: Vec2, ang_tol: float, ang_span: float, weight: float) -> Tuple[float, float, float]:
    ang = angle_error_deg(force.vec, expected_dir_unit)
    s = ramp_down_linear(ang, ang_tol, ang_span)
    return weight * s, weight, ang

def score_position_point(force, *, target: Vec2, pos_tol: float, pos_span: float, weight: float) -> Tuple[float, float, float]:
    """
    Posisjonsskår for punkt-anker (f.anchor mot target).
    """
    if getattr(force, "anchor", None) is None:
        return 0.0, weight, float("inf")
    d = vec.distance(force.anchor, target)
    s = ramp_down_linear(d, pos_tol, pos_span)
    return weight * s, weight, d

def score_position_segment(force, *, a: Vec2, b: Vec2, pos_tol: float, pos_span: float, weight: float) -> Tuple[float, float, float]:
    """
    Posisjonsskår for kontakt langs segment (f.anchor mot [a,b]).
    """
    if getattr(force, "anchor", None) is None:
        return 0.0, weight, float("inf")
    d = vec.dist_point_to_segment(force.anchor, a, b)
    s = ramp_down_linear(d, pos_tol, pos_span)
    return weight * s, weight, d

def coverage_scale(num_matched: int, num_expected: int) -> float:
    """
    Skaler den samlede delskåren etter hvor mange forventede krefter som faktisk ble riktig identifisert/benyttet.
    Hindrer høye totalskårer når bare én av flere krefter er korrekt.
    """
    if num_expected <= 0:
        return 1.0
    return clamp(num_matched / float(num_expected), 0.0, 1.0)

# ------------------------------------------------------
# Relasjons-skår (forhold mellom krefter og/eller komponenter)
# ------------------------------------------------------

def _mag_term_value(f, mag_term) -> float:
    """
    Hent verdi for en MagTerm:
      e_vec=None -> |f| (magnitude)
      e_vec=(x,y) -> dot(f.vec, unit(e_vec)) (component along direction)
    """
    if mag_term.e_vec is None:
        # Magnitude
        return vec.norm(f.vec)
    else:
        # Component along direction
        e_vec_unit = unit(mag_term.e_vec)
        if e_vec_unit == (0.0, 0.0):
            raise ValueError(f"_mag_term_value: e_vec cannot be zero vector")
        return vec.dot(f.vec, e_vec_unit)

Component = Optional[str]  # None | 'x' | 'y' | 'n' | 'p'

def _force_component(f, comp: Component, n_vec: Optional[Vec2]) -> float:
    """
    [DEPRECATED] Hent komponent/magnitude for en kraft.
    This function is kept for backwards compatibility.
    New code should use _mag_term_value() with MagTerm objects instead.
    
      comp=None -> |f|
      'x'/'y'   -> XY-komponent
      'n'/'p'   -> komponent i np-basis (krever n_vec)
      Component.* enum -> konvertert til string
    """
    # Convert Component enum to string if needed
    if hasattr(comp, 'value'):
        comp = comp.value
    
    if comp is None or comp == "full":
        return vec.norm(f.vec)
    if comp == "x":
        return f.vec[0]
    if comp == "y":
        return f.vec[1]
    if comp in ("n", "p"):
        if n_vec is None:
            raise ValueError("np-komponent krever n_vec")
        e_n = unit(n_vec)
        if e_n == (0.0, 0.0):
            raise ValueError("np-komponent: n_vec cannot be zero vector")
        e_p = (-e_n[1], e_n[0])
        return vec.dot(f.vec, e_n) if comp == "n" else vec.dot(f.vec, e_p)
    raise ValueError(f"Ukjent komponent: {comp}")

def _linear_combo(
    forces_by_key: Dict[str, object],
    terms: Sequence[Tuple[str, float]],
    comp: Component,
    n_vec: Optional[Vec2],
) -> float:
    """
    Beregn sum_i weight_i * component(force_i).
    terms: [(key, weight), ...]
    """
    acc = 0.0
    for key, w in terms:
        f = forces_by_key.get(key)
        if f is None:
            # Manglende term => ikke bidra. (Alternativt: gjøre eval feil med None.)
            continue
        acc += w * _force_component(f, comp, n_vec)
    return acc

def relation_score(
    forces_by_key: Dict[str, object],
    *,
    relation: Dict,
    n_vec: Optional[Vec2],
    tol: float,
    span: float,
) -> Tuple[float, float]:
    """
    Fleksibel relasjonsvurdering.

    Støttede former:

    1) Ratio av magnituder/komponenter:
       relation = {
         "type": "ratio",
         "num": "G",
         "den": "N",
         "target": 1.0,
         "component": None | "x" | "y" | "n" | "p"
       }

    2) Ratio av summer:
       relation = {
         "type": "ratio_sum",
         "num_terms": [("Nb", 1.0), ("G", 1.0)],
         "den_terms": [("N", 1.0)],
         "target": 1.0,
         "component": None | "x" | "y" | "n" | "p"
       }

    Returnerer: (score, error_value)
      - error_value er |målt_ratio - target|
    """
    rtype = relation.get("type", "ratio")
    component: Component = relation.get("component", None)

    if rtype == "ratio":
        num_key = relation["num"]
        den_key = relation["den"]
        target = float(relation.get("target", 1.0))
        f_num = forces_by_key.get(num_key)
        f_den = forces_by_key.get(den_key)
        if (f_num is None) or (f_den is None):
            return 0.0, float("inf")
        a = _force_component(f_num, component, n_vec)
        b = _force_component(f_den, component, n_vec)
        if abs(b) < 1e-9:
            return 0.0, float("inf")
        ratio = a / b
        err = abs(ratio - target)
        return ramp_down_linear(err, tol, span), err

    elif rtype == "ratio_sum":
        num_terms: Sequence[Tuple[str, float]] = relation.get("num_terms", [])
        den_terms: Sequence[Tuple[str, float]] = relation.get("den_terms", [])
        target = float(relation.get("target", 1.0))
        a = _linear_combo(forces_by_key, num_terms, component, n_vec)
        b = _linear_combo(forces_by_key, den_terms, component, n_vec)
        if abs(b) < 1e-9:
            return 0.0, float("inf")
        ratio = a / b
        err = abs(ratio - target)
        return ramp_down_linear(err, tol, span), err

    else:
        raise ValueError(f"Ukjent relation type: {rtype}")

# ------------------------------------------------------
# Aggregat / total
# ------------------------------------------------------

def aggregate_parts(
    part_scores: Sequence[float],
    part_weights: Optional[Sequence[float]] = None,
    *,
    min_parts: int = 0,
    matched_specs: int = 0,
    expected_specs: int = 0,
) -> float:
    """
    Kombinerer delskårer. Som default er alle likt vektet.
    Deretter skaleres resultat med coverage_scale(matched_specs/expected_specs).

    - min_parts: hvis du trenger å sikre at du har minst N deler før du regner total (ellers 0).
    """
    if min_parts and len(part_scores) < min_parts:
        return 0.0

    if not part_scores:
        base = 0.0
    else:
        if part_weights and len(part_weights) == len(part_scores):
            wsum = sum(part_weights)
            if wsum <= 0.0:
                base = 0.0
            else:
                base = sum(s * w for s, w in zip(part_scores, part_weights)) / wsum
        else:
            base = sum(part_scores) / float(len(part_scores))

    cover = coverage_scale(matched_specs, expected_specs)
    return base * cover

# ------------------------------------------------------
# Små helper-API for _check_* (valgfritt å bruke)
# ------------------------------------------------------

def count_forces_expected(forces: Sequence[object], expected_count: int) -> bool:
    """
    Enkel sjekk på antall piler tegnet. Bruk gjerne som gate for ekstra straff.
    """
    return len(forces) == expected_count

def component_tuple(forces: Sequence[object], *, basis: str, n_vec: Optional[Vec2], angle_deg: float = 0.0) -> Tuple[float, float]:
    """
    Nyttig småhjelper for å hente (c1, c2) direkte uten totalvektor.
    """
    _, c1, c2 = sumF(forces, basis=basis, n_vec=n_vec, angle_deg=angle_deg)
    return (c1, c2)


# ======================================================
# Main Task Evaluation
# ======================================================

def evaluate_task(task_spec: object, drawn_forces: Sequence[object]) -> Dict[str, object]:
    """
    Evaluate drawn forces against task specification.
    
    Args:
        task_spec: TaskSpec object defining expected forces, scene, basis, tolerances
        drawn_forces: Sequence of Force objects drawn by user (have .name, .vec, .anchor attributes)
    
    Returns:
        Dictionary with keys:
        - 'score': overall score [0, 1]
        - 'feedback': list of feedback strings
        - 'details': dict with per-force scoring details
    """
    
    # Helper function to resolve anchor specs to actual coordinates
    def resolve_anchor_spec(anchor_spec, scene):
        """Resolve an AnchorSpec to actual coordinates (point or segment)."""
        # Note: anchor_spec.kind can be either enum (Task 1/2) or string (Task 3)
        is_point = (anchor_spec.kind == AnchorType.POINT) or (anchor_spec.kind == "point") or (anchor_spec.kind == AnchorType.POINT.value)
        is_segment = (anchor_spec.kind == AnchorType.SEGMENT) or (anchor_spec.kind == "segment") or (anchor_spec.kind == AnchorType.SEGMENT.value)
        
        if is_point:
            if anchor_spec.point:
                return anchor_spec.point
            elif anchor_spec.ref and anchor_spec.point_name:
                # Resolve from scene geometry
                try:
                    # Parse ref like "rect:0" to get shape and point name
                    if ':' in anchor_spec.ref:
                        shape_type, shape_idx = anchor_spec.ref.split(':')
                        if shape_type == 'rect' and scene and hasattr(scene, 'rects'):
                            shape = scene.rects[int(shape_idx)]
                            if hasattr(shape, anchor_spec.point_name):
                                attr = getattr(shape, anchor_spec.point_name)
                                # Properties are not callable
                                return attr
                except (IndexError, AttributeError, ValueError, TypeError):
                    pass
        elif is_segment:
            if anchor_spec.segment:
                return anchor_spec.segment
            elif anchor_spec.ref and anchor_spec.segment_name:
                # Resolve from scene geometry
                try:
                    if ':' in anchor_spec.ref:
                        shape_type, shape_idx = anchor_spec.ref.split(':')
                        if shape_type == 'rect' and scene and hasattr(scene, 'rects'):
                            shape = scene.rects[int(shape_idx)]
                            # Get segment property (e.g. .bottom, .top)
                            if hasattr(shape, anchor_spec.segment_name):
                                attr = getattr(shape, anchor_spec.segment_name)
                                seg = attr  # Properties are not callable
                                # seg should be a tuple of two points
                                return seg if seg and len(seg) == 2 else None
                except (IndexError, AttributeError, ValueError, TypeError):
                    pass
        return None
    
    # ===== SCORING CONFIGURATION (All weights and parameters in one place) =====
    # Extract all tolerances from task_spec.tol
    tol = task_spec.tol if hasattr(task_spec, 'tol') else Tolerances()
    
    # Component weights function (local to evaluate_task)
    def get_component_weights(has_relations: bool):
        """
        Determine weights for equilibrium_score and relations_score in final calculation.
        
        Args:
            has_relations: True if task_spec.relation_requirements has relations defined
        
        Returns:
            (equilibrium_weight, relations_weight) tuple
        """
        if has_relations:
            return 0.0, 1.0  # relations defined: use relations, skip equilibrium
        else:
            return 1.0, 0.0  # no relations: use equilibrium, skip relations
    
    # ===== END CONFIGURATION =====
    
    if not isinstance(task_spec, TaskSpec):
        raise TypeError(f"task_spec must be TaskSpec, got {type(task_spec)}")
    
    feedback: List[str] = []
    details: Dict[str, object] = {}
    overlays: Dict[Union[str, int], List[Dict]] = {}  # Store overlays per feedback index (0, 1, 2, ...)
    
    # Empty drawing?
    # Check for non-editable forces in drawn_forces
    editable_forces = [f for f in drawn_forces if getattr(f, 'editable', True)]
    if not editable_forces:
        feedback.append("Ingen andre enn forhåndstegnet kraft er tegnet")
        return {
            'score': 0.0,
            'feedback': feedback,
            'details': details,
            'overlays': overlays,
        }
    
    
    # --- Extract tolerances ---
    ANG_TOL = tol.ang_tol_deg
    ANG_SPAN = tol.ang_span_deg
    POS_TOL = tol.pos_tol
    POS_SPAN = tol.pos_span
    SUMF_TOL = tol.sumF_tol
    SUMF_SPAN = tol.sumF_span
    REL_TOL = tol.rel_tol
    REL_SPAN = tol.rel_span
    
    # --- Get basis ---
    basis = task_spec.basis  # "xy" or "np"
    n_vec = None
    if basis == "np" and task_spec.scene.plane is not None:
        n_vec = task_spec.scene.plane.n_vec
    
    # --- Build canonical force dict by name ---
    expected_forces = task_spec.expected_forces
    if isinstance(expected_forces, dict):
        # If dict: values should be ForceSpec objects with .name attribute
        expected_dict = {spec.name: spec for spec in expected_forces.values()}
    else:
        # If list, convert to dict by .name
        expected_dict = {f.name: f for f in expected_forces}

    #################################################
    # --- Try to match drawn forces to expected ---
    ##################################################
    matched = match_forces_to_expected(expected_dict, drawn_forces, ANG_TOL, ANG_SPAN)
    
    # --- Score each expected force ---
    total_score = 0.0
    total_weight = 0.0
    editable_weight = 0.0
    
    for task_force_name, expected_spec in expected_dict.items():
        force_detail = {
            'expected': task_force_name,
            'found': False,
            'name_score': 0.0,
            'dir_score': 0.0,
            'pos_score': 0.0,
            'combined': 0.0,
        }
        
        if task_force_name in matched:
            drawn_f = matched[task_force_name]
            force_detail['found'] = True
            # Check if force is editable
            is_editable = getattr(drawn_f, 'editable', True)  # Default to True if not specified
            force_detail['is_editable'] = is_editable
            
            # Only score editable forces
            if is_editable:
                # --- Name score ---
                name_ok = False
                drawn_name_str = ""
                if hasattr(drawn_f, 'name') and drawn_f.name:
                    drawn_name_str = drawn_f.name
                name_ok = is_name_expected(drawn_f, task_force_name, expected_spec)
                name_score = 1.0 if name_ok else 0.5
                force_detail['name_score'] = name_score
                force_detail['drawn_name'] = drawn_name_str  # Store drawn name for later use in feedback
                
                # Add feedback if name is wrong AND a name was provided (not empty)
                if not name_ok and drawn_name_str and drawn_name_str.strip():
                    feedback.append(f"Feil navn på kraften: '{drawn_name_str}'")
                
                # --- Direction score ---
                dir_score = 0.0
                angle_err = None
                if hasattr(drawn_f, 'vec') and expected_spec.dir_unit:
                    angle_err = angle_error_deg(drawn_f.vec, expected_spec.dir_unit)
                    dir_score = ramp_down_linear(angle_err, ANG_TOL, ANG_SPAN)
                    force_detail['angle_error_deg'] = angle_err
                    # Add feedback/overlay only if direction is wrong AND name is accepted
                    if dir_score < 1.0 and name_ok:
                        fb_idx = len(feedback)
                        feedback.append(f"Juster retningen til {task_force_name}")
                        # Generate direction overlay (wedge) - assumes drawn_f.anchor is available
                        if hasattr(drawn_f, 'anchor') and drawn_f.anchor:
                            expected_angle_deg = math.degrees(math.atan2(expected_spec.dir_unit[1], expected_spec.dir_unit[0]))
                            # Set r_ok to half the drawn force length, r_span to full force length
                            force_length = vec.norm(drawn_f.vec) if hasattr(drawn_f, 'vec') else 30
                            overlay_item = {
                                'type': 'wedge',
                                'center': drawn_f.arrowBase if hasattr(drawn_f, 'arrowBase') else drawn_f.anchor,
                                'heading_deg': expected_angle_deg,
                                'ang_ok': ANG_TOL,
                                'ang_span': ANG_SPAN,
                                'r_ok': clamp(force_length/2, 2*GRID_STEP,10*GRID_STEP),
                                'r_span': clamp(force_length/2, 2*GRID_STEP,10*GRID_STEP),
                            }
                            overlays[fb_idx] = [overlay_item]
                
                    force_detail['dir_score'] = dir_score
                
                # --- Position score ---
                pos_score = 0.0
                selected_anchor = None  # Track which anchor was used
                
                # Only show position feedback if name is accepted
                if name_ok:
                    if hasattr(drawn_f, 'anchor') and drawn_f.anchor and expected_spec.anchor:
                        # Handle both single anchor and list of anchors
                        anchors_to_try = expected_spec.anchor if isinstance(expected_spec.anchor, list) else [expected_spec.anchor]
                        best_pos_score = 0.0
                        best_anchor = None  # Track best anchor even if score is 0
                        
                        for anchor in anchors_to_try:
                            # Handle both enum (Task 1/2) and string (Task 3) kinds
                            is_point = (anchor.kind == AnchorType.POINT) or (anchor.kind == "point") or (anchor.kind == AnchorType.POINT.value)
                            is_segment = (anchor.kind == AnchorType.SEGMENT) or (anchor.kind == "segment") or (anchor.kind == AnchorType.SEGMENT.value)
                            
                            curr_score = 0.0
                            if is_point and anchor.point:
                                d = vec.distance(drawn_f.anchor, anchor.point)
                                curr_score = ramp_down_linear(d, POS_TOL, POS_SPAN)
                                if curr_score > best_pos_score or best_anchor is None:  # Set anchor even if curr_score=0
                                    best_pos_score = curr_score
                                    pos_score = curr_score
                                    selected_anchor = anchor
                                    best_anchor = anchor
                                    force_detail['pos_error'] = d
                            elif is_segment and anchor.segment:
                                d = vec.dist_point_to_segment(drawn_f.anchor, anchor.segment[0], anchor.segment[1])
                                curr_score = ramp_down_linear(d, POS_TOL, POS_SPAN)
                                if curr_score > best_pos_score or best_anchor is None:  # Set anchor even if curr_score=0
                                    best_pos_score = curr_score
                                    pos_score = curr_score
                                    selected_anchor = anchor
                                    best_anchor = anchor
                                    force_detail['pos_error'] = d
                
                force_detail['pos_score'] = pos_score
                
                # Add feedback and overlays if position is wrong (including when pos_score = 0)
                # Only show position feedback if name is accepted
                if name_ok and expected_spec.anchor and selected_anchor and pos_score < 1.0:
                    pos_err = force_detail.get('pos_error')
                    # Determine anchor type from selected anchor (handle both enum and string kinds)
                    is_point = (selected_anchor.kind == AnchorType.POINT) or (selected_anchor.kind == "point") or (selected_anchor.kind == AnchorType.POINT.value)
                    is_segment = (selected_anchor.kind == AnchorType.SEGMENT) or (selected_anchor.kind == "segment") or (selected_anchor.kind == AnchorType.SEGMENT.value)
                    
                    if pos_err is not None:
                        anchor_type = "massemidtpunkt" if is_point else "kontaktflaten"
                        fb_idx = len(feedback)
                        feedback.append(f"Angrepspunkt til {drawn_name_str}  bør ligge i {anchor_type}")
                        
                        # Generate position overlays for ALL anchor candidates when position is wrong
                        anchors_to_show = expected_spec.anchor if isinstance(expected_spec.anchor, list) else [expected_spec.anchor]
                        try:
                            for anchor_candidate in anchors_to_show:
                                is_cand_point = (anchor_candidate.kind == AnchorType.POINT) or (anchor_candidate.kind == "point") or (anchor_candidate.kind == AnchorType.POINT.value)
                                is_cand_segment = (anchor_candidate.kind == AnchorType.SEGMENT) or (anchor_candidate.kind == "segment") or (anchor_candidate.kind == AnchorType.SEGMENT.value)
                                
                                if is_cand_point:
                                    pt = resolve_anchor_spec(anchor_candidate, task_spec.scene)
                                    if pt:
                                        overlay_item = {
                                            'type': 'circle',
                                            'center': pt,
                                            'r_ok': POS_TOL,
                                            'r_span': POS_SPAN,
                                        }
                                        if fb_idx not in overlays:
                                            overlays[fb_idx] = []
                                        overlays[fb_idx].append(overlay_item)
                                elif is_cand_segment:
                                    seg = resolve_anchor_spec(anchor_candidate, task_spec.scene)
                                    if seg and len(seg) == 2:
                                        p1, p2 = seg
                                        overlay_item = {
                                            'type': 'stadium',
                                            'a': p1,
                                            'b': p2,
                                            'r_ok': POS_TOL,
                                            'r_span': POS_SPAN,
                                        }
                                        if fb_idx not in overlays:
                                            overlays[fb_idx] = []
                                        overlays[fb_idx].append(overlay_item)
                        except Exception:
                            pass  # If resolution fails, skip overlay generation
                    else:
                        # pos_score is 0 but no pos_error recorded - anchor type might be unsupported
                        anchor_type = "massemidtpunkt" if is_point else "kontaktflaten"
                        fb_idx = len(feedback)
                        feedback.append(f"Angrepspunkt til {drawn_name_str}  bør ligge i {anchor_type}")
                        # Still try to show expected anchor positions for all candidates
                        anchors_to_show = expected_spec.anchor if isinstance(expected_spec.anchor, list) else [expected_spec.anchor]
                        try:
                            for anchor_candidate in anchors_to_show:
                                is_cand_point = (anchor_candidate.kind == AnchorType.POINT) or (anchor_candidate.kind == "point") or (anchor_candidate.kind == AnchorType.POINT.value)
                                is_cand_segment = (anchor_candidate.kind == AnchorType.SEGMENT) or (anchor_candidate.kind == "segment") or (anchor_candidate.kind == AnchorType.SEGMENT.value)
                                
                                if is_cand_point:
                                    pt = resolve_anchor_spec(anchor_candidate, task_spec.scene)
                                    if pt:
                                        overlay_item = {
                                            'type': 'circle',
                                            'center': pt,
                                            'r_ok': POS_TOL,
                                            'r_span': POS_SPAN,
                                        }
                                        if fb_idx not in overlays:
                                            overlays[fb_idx] = []
                                        overlays[fb_idx].append(overlay_item)
                                elif is_cand_segment:
                                    seg = resolve_anchor_spec(anchor_candidate, task_spec.scene)
                                    if seg and len(seg) == 2:
                                        p1, p2 = seg
                                        overlay_item = {
                                            'type': 'stadium',
                                            'a': p1,
                                            'b': p2,
                                            'r_ok': POS_TOL,
                                            'r_span': POS_SPAN,
                                        }
                                        if fb_idx not in overlays:
                                            overlays[fb_idx] = []
                                        overlays[fb_idx].append(overlay_item)
                        except Exception:
                            pass  # If resolution fails, skip overlay generation
            
                # --- Combined score (weighted average) ---
                w_n = expected_spec.w_name
                w_d = expected_spec.w_dir
                w_p = expected_spec.w_pos
                w_sum = w_n + w_d + w_p
                
                if w_sum > 0:
                    combined = (w_n * name_score + w_d * dir_score + w_p * pos_score) / w_sum
                else:
                    combined = 0.0
                
                total_score += combined
                editable_weight += 1.0  # Only count editable forces
            else:
                # Non-editable force: skip all scoring but mark as found
                force_detail['name_score'] = 1.0  # Accept as-is for relations
                force_detail['drawn_name'] = getattr(drawn_f, 'name', '')
                force_detail['dir_score'] = 1.0
                force_detail['pos_score'] = 1.0
                force_detail['combined'] = 0.0  # Don't contribute to force scoring
            
            total_weight += 1.0  # All forces count for coverage
        else:
            total_weight += 1.0
        
        details[task_force_name] = force_detail

    # --- Count forces without a provided name (found but no drawn name) ---
    # Details entries set 'drawn_name' (possibly empty) for found forces.
    # Only count EDITABLE forces (non-editable forces are pre-defined and don't need names)
    forces_without_name = [
        d for d in details.values()
        if isinstance(d, dict) and d.get('found', False) and d.get('is_editable', True) and not d.get('drawn_name', '').strip()
    ]
    num_missing_names = len(forces_without_name)
    num_wrong_names = num_missing_names    
    
    # Add consolidated feedback for forces with wrong names (only if names were provided)
    if num_wrong_names > 0:
        if num_wrong_names == 1:
            feedback.insert(0, "Det mangler navn på en kraft.")
        else:
            feedback.insert(0, f"Det mangler navn på {num_wrong_names} krefter.")

    # --- Check for missing forces ---
    missing_forces = [name for name in expected_dict.keys() if name not in matched]
    if missing_forces:
        num_missing = len(missing_forces)
        if num_missing > 0:
            feedback.append(f"Det mangler en eller flere krefter.")
    
    # --- Compute force sum equilibrium bonus ---
    equilibrium_score = 1.0
    # Only compute equilibrium if NO relation_requirements are defined
    has_relations = bool(task_spec.relation_requirements and task_spec.relation_requirements.relations)
    
    if not has_relations and matched and basis in ("xy", "np"):
        # Fallback: compute equilibrium only if relations not defined
        matched_forces = list(matched.values())      
        total_vec, c1, c2 = sumF(matched_forces, basis=basis, n_vec=n_vec, angle_deg=0.0)
        
        # ΣF magnitude (combined component check)
        res = math.hypot(c1, c2)
             
        # Find largest force magnitude for relative error calculation
        max_force = 0.0
        for f in matched_forces:
            if hasattr(f, 'vec') and f.vec:
                force_mag = vec.norm(f.vec)
                max_force = max(max_force, force_mag)
        
        # Compute relative error: |ΣF| / max_force
        if max_force > 1e-9:
            rel_err = res / max_force
        else:
            rel_err = float('inf') if res > 1e-9 else 0.0
        
        eq_score = ramp_down_linear(rel_err, SUMF_TOL, SUMF_SPAN)
        equilibrium_score = eq_score
        
        details['equilibrium'] = {
            'total_vec': total_vec,
            'c1': c1,
            'c2': c2,
            'magnitude': res,
            'max_force': max_force,
            'relative_error': rel_err,
            'score': eq_score,
        }
        
        if eq_score < 1.0:
            fb_idx = len(feedback)
            feedback.append(f"ΣF bør være ≈ 0 (basis={basis})")
            # Generate equilibrium overlay (circle at scene origin showing tolerance)
            # Use scene origin if available, otherwise use a default position
            origin = getattr(task_spec.scene, 'origin', None) or (320, 240)  # fallback to approximate center
            overlay_item = {
                'type': 'circle',
                'center': origin,
                'r_ok': SUMF_TOL * max_force if max_force > 1e-9 else 10,
                'r_span': SUMF_SPAN * max_force if max_force > 1e-9 else 50,
            }
            overlays[fb_idx] = [overlay_item]
    
    # --- Compute relation requirements scores (if any) ---
    relations_score = 1.0
    if has_relations:
        rel_req = task_spec.relation_requirements
        
        relation_scores = []
        for mag_rel in rel_req.relations:
            # Check if all related forces are present AND have correct names (not just direction guesses)
            all_names_correct = True
            for term in mag_rel.lhs:
                if term.force_name not in matched:
                    all_names_correct = False
                    break
                # Check if the name was actually accepted (name_ok was True)
                if not details[term.force_name].get('found', False):
                    all_names_correct = False
                    break
                # Check if name_score indicates the name was correct (1.0 for correct, 0.5 for wrong)
                if details[term.force_name].get('name_score', 0.0) < 1.0:
                    all_names_correct = False
                    break
            
            if all_names_correct:
                for term in mag_rel.rhs:
                    if term.force_name not in matched:
                        all_names_correct = False
                        break
                    # Check if the name was actually accepted (name_ok was True)
                    if not details[term.force_name].get('found', False):
                        all_names_correct = False
                        break
                    # Check if name_score indicates the name was correct (1.0 for correct, 0.5 for wrong)
                    if details[term.force_name].get('name_score', 0.0) < 1.0:
                        all_names_correct = False
                        break
            
            # Skip feedback for this relation if any related force has incorrect name
            if not all_names_correct:
                continue
            
            # Compute LHS = sum of (sign * mag_term_value(force, term))
            lhs_val = 0.0
            for term in mag_rel.lhs:
                if term.force_name in matched:
                    f = matched[term.force_name]
                    mag_val = _mag_term_value(f, term)
                    lhs_val += term.sign * mag_val
            
            # Compute RHS
            rhs_val = 0.0
            for term in mag_rel.rhs:
                if term.force_name in matched:
                    f = matched[term.force_name]
                    mag_val = _mag_term_value(f, term)
                    rhs_val += term.sign * mag_val
            
            # Ratio check
            if abs(rhs_val) < 1e-9:
                rel_score = 0.0
                err = float('inf')
            else:
                measured_ratio = lhs_val / rhs_val
                target_ratio = mag_rel.ratio
                err = abs(measured_ratio - target_ratio) / max(abs(target_ratio), 1.0)
                # Use ramp_down_linear with REL_TOL and REL_SPAN from tolerances
                rel_score = ramp_down_linear(err, REL_TOL, REL_SPAN)
            
            relation_scores.append(rel_score)
            rel_idx = len(relation_scores) - 1
            details[f'relation_{rel_idx}'] = {
                'lhs': lhs_val,
                'rhs': rhs_val,
                'ratio': (lhs_val / rhs_val) if abs(rhs_val) > 1e-9 else float('inf'),
                'target': mag_rel.ratio,
                'error': err,
                'score': rel_score,
            }
            
            # Add feedback if relation check fails
            if rel_score < 1.0:
                # Build descriptive relation name from lhs and rhs force names (use drawn names)
                lhs_names = [details[term.force_name].get('drawn_name', term.force_name) for term in mag_rel.lhs]
                rhs_names = [details[term.force_name].get('drawn_name', term.force_name) for term in mag_rel.rhs]
                lhs_str = "+".join(lhs_names) if lhs_names else "(?)"
                rhs_str = "+".join(rhs_names) if rhs_names else "(?)"
                # Add parentheses if multiple terms
                if len(lhs_names) > 1:
                    lhs_str = f"({lhs_str})"
                if len(rhs_names) > 1:
                    rhs_str = f"({rhs_str})"
                relation_desc = f"{lhs_str}/{rhs_str}"
                
                measured_ratio = (lhs_val / rhs_val) if abs(rhs_val) > 1e-9 else float('inf')
                if measured_ratio != float('inf'):
                    feedback.append(f"{relation_desc} burde være {mag_rel.ratio:.2f}")
                else:
                    feedback.append(f"{relation_desc}: kan ikke beregne (divisjon med null)")
        
        if relation_scores:
            relations_score = sum(relation_scores) / len(relation_scores)
    
    details['relations'] = {'score': relations_score}
    
    # --- Final score ---
    if editable_weight > 0:
        coverage = len([d for d in details.values() if isinstance(d, dict) and d.get('found', False)]) / total_weight
        base_score = total_score / editable_weight  # Only divide by editable forces
    else:
        coverage = 0.0
        base_score = 0.0
    
    # Apply coverage penalty
    coverage_factor = coverage ** COVERAGE_PENALTY_EXP  # Penalize missing forces
    
    # Get component weights based on whether relations are defined
    equilibrium_weight, relations_weight = get_component_weights(has_relations)
    
    # Combine components with intelligent weighting
    # Final score combines:
    # 1. Base force drawing score (combined name/direction/position)
    # 2. Coverage penalty (how many forces are drawn)
    # 3. Quality check (equilibrium OR relations - not both)
    #
    # Quality scoring:
    # - When relations defined: relations_score affects 50% of final (base can be 100% * rel_score)
    #   So if rel_score=0, final is base*0.5, if rel_score=1, final is base*1.0
    # - When no relations: equilibrium_score affects quality similarly
    
    # For relations, we want: good relations = full score, bad relations = reduce score by up to 50%
    # Formula: final = base * coverage * (1 - 0.5*(1-relations_score)) when relations defined
    # Which simplifies to: final = base * coverage * (0.5 + 0.5*relations_score)
    
    if relations_weight > 0.0:
        # Relations defined: relations score affects 50% of final quality
        # min_quality = 0.5 (even if relations completely fail)
        quality_multiplier = 0.5 + 0.5 * relations_score
    else:
        # No relations: use equilibrium score similarly
        # min_quality = 0.5 (even if equilibrium completely fails)
        quality_multiplier = 0.5 + 0.5 * equilibrium_score
    
    final_score = base_score * coverage_factor * quality_multiplier
    
    # Clamp to [0, 1]
    final_score = clamp(final_score, 0.0, 1.0)
    
    return {
        'score': final_score,
        'feedback': feedback,
        'details': details,
        'coverage': coverage,
        'equilibrium_score': equilibrium_score,
        'relations_score': relations_score,
        'overlays': overlays,
    }

def match_forces_to_expected(
    expected_dict: Dict[str, object],
    drawn_forces: Sequence[object],
    ang_tol: float,
    ang_span: float,
) -> Dict[str, object]:
    """
    Match drawn forces to expected forces.

    Approach:
      - Compute a match score for every (expected, drawn) pair (allowing reuse).
      - Sort pairs by score descending and greedily assign unique matches so each expected and drawn is used at most once.
      - Uses same scoring heuristic and threshold (0.2) as before.

    Returns (matched, used_indices).
    """
    # Collect all pairwise scores
    pairs = []  # (score, task_force_name, drawn_idx)
    for task_force_name, expected_spec in expected_dict.items():
        for idx, drawn_f in enumerate(drawn_forces):
            # Name match?
            name_match = False
            if hasattr(drawn_f, 'name') and drawn_f.name:
                drawn_name = normalize_name(drawn_f.name)
                task_force_name_norm = normalize_name(task_force_name)
                if drawn_name == task_force_name_norm:
                    name_match = True
                elif drawn_name in {normalize_name(a) for a in expected_spec.aliases}:
                    name_match = True

            # Direction match?
            if hasattr(drawn_f, 'vec') and expected_spec.dir_unit:
                angle_err = angle_error_deg(drawn_f.vec, expected_spec.dir_unit)
            else:
                angle_err = 180.0

            dir_match = ramp_down_linear(angle_err, ang_tol, ang_span)

            if name_match:
                combined = 0.5 + 0.5 * dir_match
            else:
                combined = NAME_MISMATCH_PENALTY * dir_match

            pairs.append((combined, task_force_name, idx))

    # Sort pairs by score descending and greedily pick unique matches
    pairs.sort(key=lambda x: x[0], reverse=True)
    matched: Dict[str, object] = {}
    used_drawn = set()
    used_expected = set()
    for score, task_name, idx in pairs:
        if score <= 0.2:
            continue
        if task_name in used_expected or idx in used_drawn:
            continue
        matched[task_name] = drawn_forces[idx]
        used_drawn.add(idx)
        used_expected.add(task_name)

    return matched

def is_name_expected(drawn_f: object, task_force_name: str, expected_spec: object) -> bool:
    """
    Return True if drawn_f.name matches canonical task_force_name or any alias (case-insensitive).
    """
    if not (hasattr(drawn_f, 'name') and drawn_f.name):
        return False
    drawn_name = normalize_name(drawn_f.name)
    task_force_name_norm = normalize_name(task_force_name)
    if drawn_name == task_force_name_norm:
        return True
    if drawn_name in {normalize_name(a) for a in expected_spec.aliases}:
        return True
    return False

"""
Wrapper for evaluate_task result dict to provide string methods for debugging.
"""

class EvaluationResult(dict):
    """
    A dict subclass that wraps the result from evaluate_task and adds string methods.
    
    Usage:
        result = EvaluationResult(evaluate_task(task_spec, forces))
        print(result.getScoresString())
        print(result.getFeedbackString())
        print(result.getOverlaysString())
    """
    
    def getScoresString(self) -> str:
        """Return formatted scores as a string."""
        score = self.get('score', 0.0)
        coverage = self.get('coverage')
        eq_score = self.get('equilibrium_score')
        rel_score = self.get('relations_score')
        cov_str = f"{coverage:.4f}" if coverage is not None else "N/A"
        eq_str = f"{eq_score:.4f}" if eq_score is not None else "N/A"
        rel_str = f"{rel_score:.4f}" if rel_score is not None else "N/A"
        return (
            f"SCORES:\n"
            f"  Final Score:        {score:.4f}\n"
            f"  Coverage:           {cov_str}\n"
            f"  Equilibrium Score:  {eq_str}\n"
            f"  Relations Score:    {rel_str}"
        )
    
    def getFeedbackString(self) -> str:
        """Return formatted feedback as a string."""
        feedback = self.get('feedback', [])
        out = [f"FEEDBACK ({len(feedback)} items):"]
        if feedback:
            for i, msg in enumerate(feedback, 1):
                out.append(f"  {i}. {msg}")
        else:
            out.append("  (ingen merknader)")
        return "\n".join(out)
    
    def getOverlaysString(self) -> str:
        """Return formatted overlays as a string."""
        overlays = self.get('overlays', {})
        if not overlays:
            return "OVERLAYS: (none)"
        out = ["OVERLAYS:"]
        for fb_idx in sorted([k for k in overlays.keys() if isinstance(k, int)]):
            items = overlays[fb_idx]
            out.append(f"  Feedback {fb_idx}: {len(items)} overlay(s)")
            for ov in items:
                out.append(f"    - {ov.get('type')}: {ov}")
        return "\n".join(out)
    
    def getDetailsString(self) -> str:
        """Return formatted details as a string."""
        details = self.get('details', {})
        if not details:
            return "DETAILS: (none)"
        out = [f"DETAILS ({len(details)} entries):"]
        for key, value in details.items():
            if isinstance(value, dict):
                out.append(f"  [{key}]")
                for subkey, subval in value.items():
                    if isinstance(subval, float):
                        out.append(f"      {subkey}: {subval:.4f}")
                    elif isinstance(subval, tuple):
                        out.append(f"      {subkey}: {subval}")
                    else:
                        out.append(f"      {subkey}: {subval}")
            else:
                out.append(f"  {key}: {value}")
        return "\n".join(out)
