# problem/spec.py
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Tuple, Dict, List, Set
import math
from typing import TypeAlias
import utils.geometry as vec  

Point: TypeAlias = tuple[float, float]
Segment: TypeAlias = tuple[Point, Point]

# ---------------------------
# Anchors (angrepspunktkrav)
# ---------------------------

class AnchorType(Enum):
    """Hvilken type 'angrepspunkt'-sjekk som skal brukes for en kraft."""
    POINT   = "point"    # Et enkelt navngitt punkt (snappoint)
    SEGMENT = "segment"  # Et linjestykke definert av to navngitte punkter
    CENTER  = "center"   # Senter i en navngitt kropp (f.eks. 'bodyA')
    ANY     = "any"      # Ingen krav (tillat hvor som helst)

@dataclass
class AnchorSpec:
    """Definerer forventet angrepspunkt for en kraft:
       - kind=AnchorType.POINT med point=(x,y)
       - kind=AnchorType.SEGMENT med segment=((x1,y1),(x2,y2))
    Beskriver angrepspunkt for en kraft.
    - kind: "point" eller "segment"
    - ref: referanse til form i scenen, f.eks. "rect:0", "circle:1".
           Hvis None kan 'point' brukes som rå koordinat.
    - point_name: navngitte punkter på figuren (center, top_center, bottom_center, ...)
    - segment_name: navngitte segmenter (bottom, top, left, right)
    - point: eksplisitt koordinat (overstyrer point_name hvis satt og ref=None)
    """    
    kind: "AnchorType"
    point: Point | None = None
    segment: Segment | None = None
    ref: Optional[str] = None                # <- NYTT: gjør kall som ref="rect:0" gyldig
    point_name: Optional[str] = None
    segment_name: Optional[str] = None
    tol: float = 12.0  # standard toleranse; juster om ønskelig

    def as_tuple(self) -> tuple:
        """Hjelper: returner (kind, data) der data er point eller segment."""
        return (self.kind, self.point if self.kind.name == "POINT" else self.segment)

    def validate(self) -> None:
        if self.kind == AnchorType.POINT:
            # OK hvis vi har en rå koordinat:
            if self.point is not None:
                return
            # ...eller en referanse + navngitt punkt:
            if (self.ref is not None) and (self.point_name is not None):
                return
            raise ValueError("AnchorSpec(kind=POINT) krever enten point=(x,y) ELLER ref+point_name.")
        elif self.kind == AnchorType.SEGMENT:
            if self.segment is not None:
                return
            if (self.ref is not None) and (self.segment_name is not None):
                return
            raise ValueError("AnchorSpec(kind=SEGMENT) krever enten segment=((x1,y1),(x2,y2)) ELLER ref+segment_name.")
        elif self.kind in (AnchorType.CENTER, AnchorType.ANY):
            # Disse trenger ikke mer informasjon her.
            return
        else:
            raise ValueError(f"Ukjent AnchorType: {self.kind}")

    @classmethod
    def from_dict(cls, d: dict) -> AnchorSpec:
        """Create AnchorSpec from dict. Converts 'kind' string to AnchorType enum."""
        if not d:
            return None
        d = d.copy()
        # Convert kind string to AnchorType enum if needed
        if isinstance(d.get('kind'), str):
            d['kind'] = AnchorType(d['kind'])
        return cls(**d)

    def to_dict(self) -> dict:
        """Serialize to dict. Converts AnchorType enum to string."""
        return {
            'kind': self.kind.value if isinstance(self.kind, AnchorType) else self.kind,
            'point': self.point,
            'segment': self.segment,
            'ref': self.ref,
            'point_name': self.point_name,
            'segment_name': self.segment_name,
            'tol': self.tol,
        }
# ---------------------------
# Toleranser og vekter
# ---------------------------

@dataclass
class Tolerances:
    """Standard toleranser for evaluering. Kan overstyres per Task/Force."""
    ang_tol_deg: float = 5.0     # vinkel – full score innenfor dette
    ang_span_deg: float = 20.0   # vinkel – falloff opp til dette
    pos_tol: float = 10.0        # posisjon – full score innenfor dette
    pos_span: float = 40.0       # posisjon – falloff opp til dette
    sumF_tol: float = 0.15       # equilibrium – full score hvis |ΣF|/max_force <= denne (relativ feil)
    sumF_span: float = 0.40      # equilibrium – falloff fra sumF_tol til sumF_tol+sumF_span (relativ feil)
    rel_tol: float = 0.15        # relation – full score innenfor dette (relativ feil)
    rel_span: float = 0.30       # relation – falloff opp til dette (relativ feil)

    @classmethod
    def from_dict(cls, d: dict) -> Tolerances:
        """Create Tolerances from dict."""
        if not d:
            return cls()
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})

    def to_dict(self) -> dict:
        """Serialize to dict."""
        return {
            'ang_tol_deg': self.ang_tol_deg,
            'ang_span_deg': self.ang_span_deg,
            'pos_tol': self.pos_tol,
            'pos_span': self.pos_span,
            'sumF_tol': self.sumF_tol,
            'sumF_span': self.sumF_span,
            'rel_tol': self.rel_tol,
            'rel_span': self.rel_span,
        }


# ---------------------------
# Størrelsesforhold
# ---------------------------

class Component(Enum):
    """Komponent for kraft/sum i en basis."""
    FULL = "full"   # vektorlengde (som tegnet)
    N    = "n"      # normal-komponenten
    P    = "p"      # parallell-komponenten
    X    = "x"
    Y    = "y"


@dataclass
class MagTerm:
    """
    Ett ledd i en lineær kombinasjon av krefter for forholdssjekk.
    
    Felter:
      - force_name: navn på kraft (f.eks. "G", "N", "R", ...)
      - e_vec: retningsvektor for komponentekstrahering
        * None (default): bruk magnitude |force|
        * (x, y): bruk komponent langs denne retningen (dot product)
      - sign: +1 eller -1 (brukes for uttrykk som (Nb+G))
    
    Eksempler:
      - MagTerm("G"): G magnitude
      - MagTerm("G", e_vec=(1, 0)): G_x (horizontal component)
      - MagTerm("G", e_vec=plane.n_vec): G_n (component normal to plane)
    """
    force_name: str                 # f.eks. "G", "N", "R", ...
    e_vec: Optional[Tuple[float, float]] = None  # None=magnitude, (x,y)=component along direction
    sign: float = 1.0               # +1 eller -1 (brukes for uttrykk som (Nb+G))

    @classmethod
    def from_dict(cls, d: dict) -> MagTerm:
        """Create MagTerm from dict."""
        if not d:
            return None
        d = d.copy()
        # Convert e_vec list to tuple if needed
        if 'e_vec' in d and d['e_vec'] is not None:
            d['e_vec'] = tuple(d['e_vec']) if not isinstance(d['e_vec'], tuple) else d['e_vec']
        return cls(**d)

    def to_dict(self) -> dict:
        """Serialize to dict."""
        return {
            'force_name': self.force_name,
            'e_vec': self.e_vec,
            'sign': self.sign,
        }


@dataclass
class MagnitudeRelation:
    """
    Definerer et forventet forhold mellom summer/enkeltkrefter.
    
    Felter:
      - lhs: liste av MagTerm (venstre side)
      - rhs: liste av MagTerm (høyre side)
      - ratio: målreferanseforhold (målt_ratio = lhs_sum / rhs_sum skal ≈ ratio)
      - tol_rel: relativ toleranse, f.eks. 0.15 = ±15%
    
    Eksempler:
      - G/N = 1 (magnitude)
        MagnitudeRelation(lhs=[MagTerm("G")], rhs=[MagTerm("N")], ratio=1.0)
      
      - R/F = 1 (magnitude)
        MagnitudeRelation(lhs=[MagTerm("R")], rhs=[MagTerm("F")], ratio=1.0)
      
      - (Nb+G)/N = 1
        MagnitudeRelation(lhs=[MagTerm("Nb"), MagTerm("G")], rhs=[MagTerm("N")], ratio=1.0)
      
      - N/G_n = 1 (N magnitude vs G normal component)
        MagnitudeRelation(lhs=[MagTerm("N")], rhs=[MagTerm("G", e_vec=plane.n_vec)], ratio=1.0)
    """
    lhs: List[MagTerm]
    rhs: List[MagTerm]
    ratio: float = 1.0
    tol_rel: float = 0.15  # relativ toleranse på forholdet, f.eks. ±15%

    @classmethod
    def from_dict(cls, d: dict) -> MagnitudeRelation:
        """Create MagnitudeRelation from dict."""
        if not d:
            return None
        d = d.copy()
        # Convert lhs/rhs dicts to MagTerm objects
        if 'lhs' in d:
            d['lhs'] = [MagTerm.from_dict(t) if isinstance(t, dict) else t for t in d['lhs']]
        if 'rhs' in d:
            d['rhs'] = [MagTerm.from_dict(t) if isinstance(t, dict) else t for t in d['rhs']]
        return cls(**d)

    def to_dict(self) -> dict:
        """Serialize to dict."""
        return {
            'lhs': [t.to_dict() if hasattr(t, 'to_dict') else t for t in self.lhs],
            'rhs': [t.to_dict() if hasattr(t, 'to_dict') else t for t in self.rhs],
            'ratio': self.ratio,
            'tol_rel': self.tol_rel,
        }

# --- legg til i problem/spec.py ---

@dataclass
class RelationRequirement:
    """
    Samler forholdskrav (MagnitudeRelation) for én oppgave.
    
    Felter:
      - relations: liste av MagnitudeRelation (hver har egen tol_rel)
      - basis: Deprecated field (kept for backwards compatibility). 
               Direction vectors are now specified directly in MagTerm.e_vec.
      - n_vec: Deprecated field (kept for backwards compatibility).
               Direction vectors are now specified directly in MagTerm.e_vec.
    
    BRUK AV e_vec I MagTerm:
    
    - MagTerm("G"): G magnitude |G|
    - MagTerm("G", e_vec=(1, 0)): G_x (horizontal component)
    - MagTerm("G", e_vec=(0, -1)): G_y (vertical component)
    - MagTerm("G", e_vec=plane.n_vec): G_n (component normal to plane)
    - MagTerm("G", e_vec=plane.t): G_p (component parallel to plane)
    
    Eksempel (oppgave 1: G/N = 1.0, magnitude basis):
      RelationRequirement(
          relations=[
              MagnitudeRelation(
                  lhs=[MagTerm("G")],  # magnitude
                  rhs=[MagTerm("N")],  # magnitude
                  ratio=1.0,
                  tol_rel=0.15
              )
          ]
      )
    
    Eksempel (oppgave 5: G_n / N = 1.0, normal component):
      RelationRequirement(
          relations=[
              MagnitudeRelation(
                  lhs=[MagTerm("G", e_vec=plane.n_vec)],  # G normal component
                  rhs=[MagTerm("N")],                     # N magnitude
                  ratio=1.0,
                  tol_rel=0.15
              )
          ]
      )
    """
    relations: List[MagnitudeRelation] = field(default_factory=list)
    basis: str = "xy"  # Deprecated - kept for backwards compatibility
    n_vec: Optional[Tuple[float, float]] = None  # Deprecated - kept for backwards compatibility

    @classmethod
    def from_dict(cls, d: dict) -> RelationRequirement:
        """Create RelationRequirement from dict."""
        if not d:
            return cls()
        d = d.copy()
        # Convert relations dicts to MagnitudeRelation objects
        if 'relations' in d:
            d['relations'] = [MagnitudeRelation.from_dict(r) if isinstance(r, dict) else r for r in d['relations']]
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})

    def to_dict(self) -> dict:
        """Serialize to dict."""
        return {
            'relations': [r.to_dict() if hasattr(r, 'to_dict') else r for r in self.relations],
            'basis': self.basis,
            'n_vec': self.n_vec,
        }

# ---------------------------
# Kraftspesifikasjon
# ---------------------------

@dataclass
class ForceSpec:
    name: str
    aliases: Set[str] = field(default_factory=set)

    # Retningsspesifikasjon
    dir_unit: Optional[Tuple[float, float]] = None
    angle_deg: Optional[float] = None

    # --- NYTT: alias-støtte for ett-ankers shorthand ---
    anchor: Optional[AnchorSpec] = None          # <--- legg til denne
    
    # Toleranser (default – kan override pr oppgave)
    w_name: float = 1.0   # vekt for korrekt navn
    w_dir: float  = 1.0   # vekt for korrekt retning
    w_pos: float  = 1.0   # vekt for korrekt angrepspunkt
    
    def __post_init__(self):
        # Hvis angle_deg er gitt uten dir_unit, lag enhetsvektor
        if self.angle_deg is not None and self.dir_unit is None:
            a = math.radians(self.angle_deg)
            self.dir_unit = (math.cos(a), math.sin(a))

    @classmethod
    def from_dict(cls, d: dict) -> ForceSpec:
        """Create ForceSpec from dict."""
        if not d:
            return None
        d = d.copy()
        # Convert anchor dict to AnchorSpec if needed
        if 'anchor' in d and isinstance(d['anchor'], dict):
            d['anchor'] = AnchorSpec.from_dict(d['anchor'])
        # Convert aliases list to set if needed
        if 'aliases' in d and isinstance(d['aliases'], (list, tuple)):
            d['aliases'] = set(d['aliases'])
        return cls(**d)

    def to_dict(self) -> dict:
        """Serialize to dict."""
        return {
            'name': self.name,
            'aliases': list(self.aliases) if self.aliases else [],
            'dir_unit': self.dir_unit,
            'angle_deg': self.angle_deg,
            'anchor': self.anchor.to_dict() if self.anchor else None,
            'w_name': self.w_name,
            'w_dir': self.w_dir,
            'w_pos': self.w_pos,
        }

@dataclass
class TaskForceSpec:
    """
    Spesifikasjon for en ferdigtegnet kraft som er del av oppgave-oppsettet.
    
    Brukes for å vise referanse-krefter eller krefter som ikke skal tegnes av brukeren.
    Kraften blir tegnet i samme stil som bruker-tegnede krefter og inkludert i evalueringen.
    
    Args:
        anchor: Angrepspunkt (x, y)
        arrow_base: Basispunkt for pil (x, y)
        arrow_tip: Endepunkt for pil (x, y)
        name: Navn på kraft (f.eks. "F", "N")
        editable: Om angrepspunkt kan redigeres (default: False)
        moveable: Om pil kan flyttes (default: False)
    """
    anchor: Point
    arrow_base: Point
    arrow_tip: Point
    name: str = ""
    editable: bool = False
    moveable: bool = False

    @classmethod
    def from_dict(cls, d: dict) -> TaskForceSpec:
        """Create TaskForceSpec from dict."""
        if not d:
            return None
        d = d.copy()
        # Convert list to tuple for points if needed
        for key in ['anchor', 'arrow_base', 'arrow_tip']:
            if key in d and isinstance(d[key], (list, tuple)):
                d[key] = tuple(d[key])
        return cls(**d)

    def to_dict(self) -> dict:
        """Serialize to dict."""
        return {
            'anchor': self.anchor,
            'arrow_base': self.arrow_base,
            'arrow_tip': self.arrow_tip,
            'name': self.name,
            'editable': self.editable,
            'moveable': self.moveable,
        }

# ---------------------------
# Scenes
# ---------------------------

@dataclass
@dataclass
class PlaneSpec:
    """2D plan definert av PlanSpec(punkt,retning).
    - Punkt: through (x, y) MÅ gis.
    - Retning: 
        ENTEN angle_deg (i forhold til horisontalen, 
                        positiv retning mot klokka) 
        ELLER n_vec (normalvektor, negativ y-akse opp pga pygame) , 
        ELLER p_vec (retningsvektor paralell med planet, positiv retning mot høyre).
    - snap_on: hvis False, legges snap-punkter ikke til (for bakgrunnsobjekter)
    - color: RGB-tuppel for linjefarge (standard grå)
    - stroke_width: pikselbredde på linjen (standard 4)
    - visible: hvis False, tegnes ikke planet (standard True)
    """
    through: tuple[float, float]                 # påkrevd
    angle_deg: float | None = None               # ELLER
    n_vec: tuple[float, float] | None = None     # ELLER
    p_vec: tuple[float, float] | None = None     # tangent-vektor langs planet (settes i __post_init__)
    snap_on: bool = True                         # om snap-punkter skal legges til
    color: tuple[int, int, int] | None = None   # RGB-farge (standard brukes i render.py)
    stroke_width: int | None = None              # pikselbredde (standard 4)
    visible: bool = True                         # om planet skal tegnes

    def __post_init__(self):
        if self.through is None:
            raise ValueError("PlaneSpec: 'through' må settes for å entydig bestemme planet.")

        has_angle = self.angle_deg is not None
        has_nvec  = self.n_vec is not None

        if has_angle == has_nvec:
            # Enten ingen, eller begge – begge er tvetydig
            raise ValueError("PlaneSpec: sett enten 'angle_deg' ELLER 'n_vec', men ikke begge.")

        if has_angle:
            # Bygg normal fra vinkel
            a = math.radians(self.angle_deg)
            # normal oppover (90° rotasjon i pygame hvor y peker ned)
            # n = (-sin(a), -cos(a))
            # tangent langs planet (90° rotasjon av normal)
            # t = (-n_y, n_x) = (cos(a), -sin(a))
            nx, ny = -math.sin(a), -math.cos(a)
            tx, ty = -ny, nx
            self.n_vec = vec.unit((nx, ny))
            self.p_vec = vec.unit((tx, ty))

        if has_nvec:
            # Normaliser og derivér angle_deg for UI/tegning
            self.n_vec = vec.unit(self.n_vec)
            # tangent (langs planet), vinkelrett på n (90° rotasjon mot klokka)
            t = (-self.n_vec[1], self.n_vec[0])
            self.p_vec = vec.unit(t)
            # angle_deg: atan2(t[1], t[0]) gir -angle, så bruk -atan2
            a = math.degrees(math.atan2(t[1], t[0]))
            self.angle_deg = (-a) % 360

    @classmethod
    def from_dict(cls, d: dict) -> PlaneSpec:
        """Create PlaneSpec from dict. Converts through/n_vec/color from lists to tuples if needed."""
        if not d:
            return None
        d = d.copy()
        # Convert through to tuple if list
        if 'through' in d and isinstance(d['through'], list):
            d['through'] = tuple(d['through'])
        # Convert n_vec to tuple if list
        if 'n_vec' in d and d['n_vec'] is not None and isinstance(d['n_vec'], list):
            d['n_vec'] = tuple(d['n_vec'])
        # Convert p_vec to tuple if list (usually computed, but allow override)
        if 'p_vec' in d and d['p_vec'] is not None and isinstance(d['p_vec'], list):
            d['p_vec'] = tuple(d['p_vec'])
        # Convert color to tuple if list
        if 'color' in d and d['color'] is not None and isinstance(d['color'], list):
            d['color'] = tuple(d['color'])
        return cls(**d)

    def to_dict(self) -> dict:
        """Serialize to dict. Does not include computed p_vec (it's derived)."""
        return {
            'through': self.through,
            'angle_deg': self.angle_deg,
            'n_vec': self.n_vec,
            'snap_on': self.snap_on,
            'color': self.color,
            'stroke_width': self.stroke_width,
            'visible': self.visible,
        }

    @property
    def n(self) -> tuple[float, float]:
        return self.n_vec  # alias

    @property
    def t(self) -> tuple[float, float]:
        # tangent (langs planet), vinkelrett på n
        return (-self.n_vec[1], self.n_vec[0])

    def basis_np(self) -> tuple[tuple[float, float], tuple[float, float]]:
        """Enhetsbasis (n, p) der p er langs planet (t)."""
        e_n = self.n_vec
        e_p = self.t
        return e_n, e_p

    def project_point(self, P: tuple[float, float]) -> tuple[float, float]:
        """Ortogonal projeksjon av P på planet (langs normal)."""
        e_n, e_p = self.basis_np()
        r = vec.sub(P, self.through)
        comp_p = vec.dot(r, e_p)
        return vec.add(self.through, vec.scale(e_p, comp_p))

    def signed_distance(self, P: tuple[float, float]) -> float:
        """Signert avstand fra P til planet (positiv i normalretning)."""
        e_n, _ = self.basis_np()
        r = vec.sub(P, self.through)
        return vec.dot(r, e_n)


# ---------------------------
# SegmentSpec
# ---------------------------

@dataclass
class SegmentSpec:
    """Linjestykke definert av punkt a og enten punkt b ELLER retning + lengde.
    
    Opsjon 1: SegmentSpec(a=(x1, y1), b=(x2, y2))
        Gir direkte to endepunkter.
    
    Opsjon 2: SegmentSpec(a=(x1, y1), direction=(dx, dy), segment_length=L)
        Gir punkt a, retning (vil bli normalisert), og lengde.
        Punkt b beregnes som: b = a + segment_length * unit(direction)
    
    Properties: a, b, vec (b - a), length, p_vec (enhetsvekt langs segment), n_vec (normal, 90° rotert)
    
    - color: RGB-tuppel for linjefarge (standard brukes i render.py)
    - stroke_width: pikselbredde på linjen (standard 2)
    """
    a: tuple[float, float]                          # påkrevd
    b: tuple[float, float] | None = None            # ELLER
    direction: tuple[float, float] | None = None    # ELLER
    segment_length: float | None = None             # (hvis direction)
    snap_on: bool = True                            # om snap-punkter skal legges til
    color: tuple[int, int, int] | None = None      # RGB-farge (standard brukes i render.py)
    stroke_width: int | None = None                 # pikselbredde (standard 2)

    def __post_init__(self):
        if self.a is None:
            raise ValueError("SegmentSpec: 'a' må settes.")

        has_b = self.b is not None
        has_dir = self.direction is not None

        if has_b and has_dir:
            raise ValueError("SegmentSpec: sett enten 'b' ELLER 'direction+segment_length', ikke begge.")

        if not has_b and not has_dir:
            raise ValueError("SegmentSpec: sett enten 'b' ELLER 'direction+segment_length'.")

        if has_dir:
            if self.segment_length is None:
                raise ValueError("SegmentSpec: hvis 'direction' settes, må 'segment_length' også settes.")
            dir_unit = vec.unit(self.direction)
            self.b = vec.add(self.a, vec.scale(dir_unit, self.segment_length))

    @classmethod
    def from_dict(cls, d: dict) -> SegmentSpec:
        """Create SegmentSpec from dict. Converts a/b/direction/color from lists to tuples if needed."""
        if not d:
            return None
        d = d.copy()
        # Convert point coordinates to tuples if lists
        for key in ['a', 'b', 'direction', 'color']:
            if key in d and d[key] is not None and isinstance(d[key], list):
                d[key] = tuple(d[key])
        return cls(**d)

    def to_dict(self) -> dict:
        """Serialize to dict. Does not include computed b (if from direction)."""
        return {
            'a': self.a,
            'b': self.b,
            'direction': self.direction,
            'segment_length': self.segment_length,
            'snap_on': self.snap_on,
            'color': self.color,
            'stroke_width': self.stroke_width,
        }

    @property
    def vec(self) -> tuple[float, float]:
        """Vektor fra a til b."""
        return vec.sub(self.b, self.a)

    @property
    def length(self) -> float:
        """Lengde av segmentet."""
        return vec.norm(self.vec)

    @property
    def p_vec(self) -> tuple[float, float]:
        """Enhetsvekt langs segment (fra a mot b)."""
        return vec.unit(self.vec)

    @property
    def n_vec(self) -> tuple[float, float]:
        """Normal til segment (90° rotert mot klokka)."""
        p = self.p_vec
        return (-p[1], p[0])

    def midpoint(self) -> tuple[float, float]:
        """Midtpunkt av segmentet."""
        return vec.scale(vec.add(self.a, self.b), 0.5)


# ArrowSpec
# ---------------------------

@dataclass
class ArrowSpec:
    """Pil tegnet fra punkt a til punkt b med valgfrie stil-parametere.
    
    Eksempler:
      - ArrowSpec(a=(50, 100), b=(150, 200))  # enkel pil med enkelt pilhode
      - ArrowSpec(a=(50, 100), b=(150, 200), body="dashed", arrowhead="double")
    
    Parameters:
      - a: startpunkt (tuple)
      - b: endepunkt (tuple)
      - body: "single" (solid), "double" (dobbel), "dashed" (stiplet) - default: "single"
      - arrowhead: "single" eller "double" - default: "single"
      - snap_on: om snap-punkter skal legges til - default: False (pilar er ofte bakgrunnsobjekter)
      - color: RGB-tuppel for pilfargen - default: brukes i render.py
      - stroke_width: pikselbredde på linjen - default: 2 eller 3
    """
    a: tuple[float, float]                      # startpunkt
    b: tuple[float, float]                      # endepunkt
    body: str = "single"                        # "single", "double", eller "dashed"
    arrowhead: str = "single"                   # "single" eller "double"
    snap_on: bool = False                       # pilar er typisk bakgrunnsobjekter
    color: tuple[int, int, int] | None = None  # RGB-farge
    stroke_width: int | None = None             # pikselbredde

    def __post_init__(self):
        # Validering av body og arrowhead
        if self.body not in {"single", "double", "dashed"}:
            raise ValueError(f"ArrowSpec: body må være 'single', 'double', eller 'dashed', ikke '{self.body}'")
        if self.arrowhead not in {"single", "double"}:
            raise ValueError(f"ArrowSpec: arrowhead må være 'single' eller 'double', ikke '{self.arrowhead}'")

    @classmethod
    def from_dict(cls, d: dict) -> ArrowSpec:
        """Create ArrowSpec from dict. Converts a/b/color from lists to tuples if needed."""
        if not d:
            return None
        d = d.copy()
        # Convert point coordinates and color to tuples if lists
        for key in ['a', 'b', 'color']:
            if key in d and d[key] is not None and isinstance(d[key], list):
                d[key] = tuple(d[key])
        return cls(**d)

    def to_dict(self) -> dict:
        """Serialize to dict."""
        return {
            'a': self.a,
            'b': self.b,
            'body': self.body,
            'arrowhead': self.arrowhead,
            'snap_on': self.snap_on,
            'color': self.color,
            'stroke_width': self.stroke_width,
        }

    @property
    def vec(self) -> tuple[float, float]:
        """Vektor fra a til b."""
        return vec.sub(self.b, self.a)

    @property
    def length(self) -> float:
        """Lengde av pilen."""
        return vec.norm(self.vec)


# TextSpec
# ---------------------------

@dataclass
class TextSpec:
    """Tekst tegnet på en posisjon i scenen.
    
    Eksempler:
      - TextSpec(txt="Radius R", pos=(100, 50))  # Standard Arial, size 10
      - TextSpec(txt="F", pos=(150, 200), color=(255, 0, 0), size=14, align="center")
    
    Parameters:
      - txt: Tekststrengen som skal tegnes
      - pos: Posisjon (x, y) der teksten skal tegnes
      - font: Fontnavn - "Arial" (standard), "Courier", etc. (fallback: systemfont)
      - color: RGB-tuppel for tekstfarge - default: (0, 0, 0) svart
      - size: Fontstørrelse i pixels - default: 10
      - align: "left", "center", eller "right" - angir hvilken del av teksten som er ved pos
    """
    txt: str                                        # tekststreng
    pos: tuple[float, float]                        # posisjon (x, y)
    font: str = "Arial"                             # fontnavn
    color: tuple[int, int, int] = (0, 0, 0)       # RGB-farge (default: svart)
    size: int = 10                                  # fontstørrelse
    align: str = "left"                             # "left", "center", eller "right"

    def __post_init__(self):
        # Validering av align
        if self.align not in {"left", "center", "right"}:
            raise ValueError(f"TextSpec: align må være 'left', 'center', eller 'right', ikke '{self.align}'")

    @classmethod
    def from_dict(cls, d: dict) -> TextSpec:
        """Create TextSpec from dict. Converts pos and color from lists to tuples if needed."""
        if not d:
            return None
        d = d.copy()
        # Convert position and color to tuples if lists
        for key in ['pos', 'color']:
            if key in d and d[key] is not None and isinstance(d[key], list):
                d[key] = tuple(d[key])
        return cls(**d)

    def to_dict(self) -> dict:
        """Serialize to dict."""
        return {
            'txt': self.txt,
            'pos': self.pos,
            'font': self.font,
            'color': self.color,
            'size': self.size,
            'align': self.align,
        }


Point = Tuple[float, float]


@dataclass
class RectSpec:
    """
    Rektangel spesifisert ved posisjon (center eller bottom_center),
    bredde, høyde og orientering.

    Eksempler:
      - RectSpec(position=(100, 100), width=50, height=40, position_kind="center")
      - RectSpec(position=(100, 100), width=50, height=40, position_kind="bottom_center")
    
    - color: RGB-tuppel for kantfarge (standard brukes i render.py)
    - stroke_width: pikselbredde på kant (standard 2)
    - fill_color: RGB-tuppel for fylling (med SCENE_ALPHA)
    """
    width: float
    height: float
    position: Point
    position_kind: str = "bottom_center"  # "center" eller "bottom_center"
    angle_deg: float | None = None
    normal_vector: Tuple[float, float] | None = None
    snap_on: bool = True                  # om snap-punkter skal legges til (for bakgrunnsobjekter)
    color: tuple[int, int, int] | None = None   # RGB-farge (standard brukes i render.py)
    stroke_width: int | None = None              # pikselbredde (standard 2)
    fill_color: tuple[int, int, int] | None = None  # RGB-farge for fylling (med SCENE_ALPHA)

    # disse fylles i __post_init__
    _angle_deg_resolved: float = field(init=False, repr=False)
    _t: Point = field(init=False, repr=False)  # enhetsvektor langs bunn/top
    _n: Point = field(init=False, repr=False)  # enhetsnormal (vinkelrett på t)
    _bottom_center_resolved: Point = field(init=False, repr=False)  # det resolvert bunnsenter

    def __post_init__(self) -> None:
        # 1. Sett t/n direkte hvis normal_vector er gitt
        if self.normal_vector is not None:
            self._n = vec.unit(self.normal_vector)
            # tangent er 90° rotasjon av normal (i pygame hvor y peker ned)
            # n er vinkelrett oppover; t er langs planet
            # t = (-n_y, n_x)  <- 90° rotasjon mot klokka
            self._t = vec.unit((-self._n[1], self._n[0]))
            # Beregn vinkel: atan2(t_y, t_x) gir -angle, så bruk -atan2
            a = math.degrees(math.atan2(self._t[1], self._t[0]))
            self._angle_deg_resolved = (-a) % 360
        elif self.angle_deg is not None:
            # Beregn t/n fra vinkel (samme som PlaneSpec)
            self._angle_deg_resolved = float(self.angle_deg)
            a = math.radians(self._angle_deg_resolved)
            # normal oppover (90° rotasjon i pygame hvor y peker ned)
            nx, ny = -math.sin(a), -math.cos(a)
            self._n = vec.unit((nx, ny))
            # tangent langs planet (90° rotasjon av normal)
            # t = (-n_y, n_x) = (cos(a), -sin(a))
            tx, ty = -ny, nx
            self._t = vec.unit((tx, ty))
        else:
            # Ingen orientering gitt - default horisontal
            self._angle_deg_resolved = 0.0
            self._t = (1.0, 0.0)
            self._n = (0.0, -1.0)

        # 2. Beregn resolved bottom_center fra position og position_kind
        if self.position_kind == "bottom_center":
            self._bottom_center_resolved = self.position
        elif self.position_kind == "center":
            # bottom_center = center + n*(h/2)
            self._bottom_center_resolved = vec.add(self.position, vec.scale(self._n, self.height * 0.5))
        else:
            raise ValueError(f"RectSpec: position_kind må være 'center' eller 'bottom_center', ikke '{self.position_kind}'")

    @classmethod
    def from_dict(cls, d: dict) -> RectSpec:
        """Create RectSpec from dict. Converts position/normal_vector/color from lists to tuples if needed."""
        if not d:
            return None
        d = d.copy()
        # Convert point coordinates to tuples if lists
        if 'position' in d and isinstance(d['position'], list):
            d['position'] = tuple(d['position'])
        if 'normal_vector' in d and d['normal_vector'] is not None and isinstance(d['normal_vector'], list):
            d['normal_vector'] = tuple(d['normal_vector'])
        # Convert color to tuple if list
        if 'color' in d and d['color'] is not None and isinstance(d['color'], list):
            d['color'] = tuple(d['color'])
        if 'fill_color' in d and d['fill_color'] is not None and isinstance(d['fill_color'], list):
            d['fill_color'] = tuple(d['fill_color'])
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})

    def to_dict(self) -> dict:
        """Serialize to dict. Does not include computed fields (_angle_deg_resolved, _t, _n, etc.)."""
        return {
            'width': self.width,
            'height': self.height,
            'position': self.position,
            'position_kind': self.position_kind,
            'angle_deg': self.angle_deg,
            'normal_vector': self.normal_vector,
            'snap_on': self.snap_on,
            'color': self.color,
            'stroke_width': self.stroke_width,
            'fill_color': self.fill_color,
        }

    # ---------- interne hjelpere ----------
    def _offset(self, p: Point, scale_t: float = 0.0, scale_n: float = 0.0) -> Point:
        """p + scale_t * t + scale_n * n"""
        return vec.add(p, (self._t[0] * scale_t + self._n[0] * scale_n,
                           self._t[1] * scale_t + self._n[1] * scale_n))

    # ---------- grunnleggende punkter ----------
    @property
    def angle_resolved(self) -> float:
        """Den effektive vinkelen (grader) som brukes av rektangelet."""
        return self._angle_deg_resolved

    @property
    def t_vec(self) -> Point:
        """Enhetsvektor langs bunn-/toppkant (tangent)."""
        return self._t

    @property
    def n_vec(self) -> Point:
        """Enhetsnormal (vinkelrett på bunnkant)."""
        return self._n

    @property
    def center(self) -> Point:
        """Beregnet senter fra resolved bottom_center."""
        # center = bottom_center + n*(h/2)
        return self._offset(self._bottom_center_resolved, scale_n=self.height * 0.5)

    @property
    def bottom_center(self) -> Point:
        """Resolved bunnsenter."""
        return self._bottom_center_resolved

    @property
    def top_center(self) -> Point:
        # top_center ligger én høyde oppover langs normal-retningen
        return self._offset(self._bottom_center_resolved, scale_n=self.height)

    @property
    def left_bottom(self) -> Point:
        # venstre ende av bunnkant: bottom_center - t*(w/2)
        return self._offset(self._bottom_center_resolved, scale_t=-(self.width * 0.5))

    @property
    def right_bottom(self) -> Point:
        return self._offset(self._bottom_center_resolved, scale_t=(self.width * 0.5))

    @property
    def left_top(self) -> Point:
        # toppkantens venstre: top_center - t*(w/2)
        return self._offset(self.top_center, scale_t=-(self.width * 0.5))

    @property
    def right_top(self) -> Point:
        return self._offset(self.top_center, scale_t=(self.width * 0.5))

    @property
    def left_middle(self) -> Point:
        """Midt på venstre kant."""
        return self._offset(self.center, scale_t=-(self.width * 0.5))

    @property
    def right_middle(self) -> Point:
        """Midt på høyre kant."""
        return self._offset(self.center, scale_t=(self.width * 0.5))

    @property
    def top_left(self) -> Point:
        """Alias for left_top."""
        return self.left_top

    @property
    def top_right(self) -> Point:
        """Alias for right_top."""
        return self.right_top

    @property
    def bottom_left(self) -> Point:
        """Alias for left_bottom."""
        return self.left_bottom

    @property
    def bottom_right(self) -> Point:
        """Alias for right_bottom."""
        return self.right_bottom

    # ---------- alias samme som tidligere kode brukte ----------
    @property
    def bottom(self) -> Tuple[Point, Point]:
        return (self.left_bottom, self.right_bottom)

    @property
    def top(self) -> Tuple[Point, Point]:
        return (self.left_top, self.right_top)

    @property
    def left(self) -> Tuple[Point, Point]:
        return (self.left_bottom, self.left_top)

    @property
    def right(self) -> Tuple[Point, Point]:
        return (self.right_bottom, self.right_top)

    # ---------- oppslag ----------
    @property
    def points(self) -> Dict[str, Point]:
        return {
            "center": self.center,
            "bottom_center": self.bottom_center,
            "top_center": self.top_center,
            "left_bottom": self.left_bottom,
            "right_bottom": self.right_bottom,
            "left_top": self.left_top,
            "right_top": self.right_top,
            "left_middle": self.left_middle,
            "right_middle": self.right_middle,
        }
    @property
    def snappoints(self) -> Dict[str, Point]:
        return {
            "center": self.center,
            "bottom_center": self.bottom_center,
            "top_center": self.top_center,
            "left_bottom": self.left_bottom,
            "right_bottom": self.right_bottom,
            "left_top": self.left_top,
            "right_top": self.right_top,
            "left_middle": self.left_middle,
            "right_middle": self.right_middle,
        }
    def get_point(self, name: str) -> Point:
        try:
            return self.points[name]
        except KeyError:
            raise KeyError(f"RectSpec.get_point: ukjent punktnavn '{name}'")

    def get_segment(self, name: str) -> Tuple[Point, Point]:
        name = name.lower()
        if name == "bottom":
            return self.bottom
        if name == "top":
            return self.top
        if name == "left":
            return self.left
        if name == "right":
            return self.right
        raise KeyError(f"RectSpec.get_segment: ukjent segmentnavn '{name}'")


@dataclass
class CircleSpec:
    center: Tuple[float, float]
    radius: float
    snap_on: bool = True                  # om snap-punkter skal legges til
    color: tuple[int, int, int] | None = None   # RGB-farge for kantlinjen (standard brukes i render.py)
    stroke_width: int | None = None              # pikselbredde på kant (standard 2)
    fill_color: tuple[int, int, int] | None = None  # RGB-farge for fylling (med SCENE_ALPHA)

    @classmethod
    def from_dict(cls, d: dict) -> CircleSpec:
        """Create CircleSpec from dict. Converts center/color from lists to tuples if needed."""
        if not d:
            return None
        d = d.copy()
        # Convert center to tuple if list
        if 'center' in d and isinstance(d['center'], list):
            d['center'] = tuple(d['center'])
        # Convert color to tuple if list
        if 'color' in d and d['color'] is not None and isinstance(d['color'], list):
            d['color'] = tuple(d['color'])
        if 'fill_color' in d and d['fill_color'] is not None and isinstance(d['fill_color'], list):
            d['fill_color'] = tuple(d['fill_color'])
        return cls(**d)

    def to_dict(self) -> dict:
        """Serialize to dict."""
        return {
            'center': self.center,
            'radius': self.radius,
            'snap_on': self.snap_on,
            'color': self.color,
            'stroke_width': self.stroke_width,
            'fill_color': self.fill_color,
        }

    # ---------- Hjelpere ----------
    def point_on(self, angle_deg: float) -> Tuple[float, float]:
        """Punkt på sirkelen ved vinkel (grader). 0° peker mot +x, y peker nedover på skjerm."""
        a = math.radians(angle_deg)
        cx, cy = self.center
        return (cx + self.radius * math.cos(a), cy + self.radius * math.sin(a))

    # ---------- Karakteristiske punkter ----------
    @property
    def right(self) -> Tuple[float, float]:
        cx, cy = self.center
        return (cx + self.radius, cy)

    @property
    def left(self) -> Tuple[float, float]:
        cx, cy = self.center
        return (cx - self.radius, cy)

    @property
    def top(self) -> Tuple[float, float]:
        cx, cy = self.center
        # y-akse peker nedover → topp er cy - r
        return (cx, cy - self.radius)

    @property
    def bottom(self) -> Tuple[float, float]:
        cx, cy = self.center
        return (cx, cy + self.radius)

    @property
    def snappoints(self) -> Dict[str, Tuple[float, float]]:
        """Standard snap-punkter: senter + kardinalpunkter."""
        return {
            "center": self.center,
            "top": self.top,
            "bottom": self.bottom,
            "left": self.left,
            "right": self.right,
        }


@dataclass
class SceneSpec:
    plane: "PlaneSpec | None" = None
    rects: List["RectSpec"] = field(default_factory=list)
    circles: List["CircleSpec"] = field(default_factory=list)
    segments: List["SegmentSpec"] = field(default_factory=list)
    arrows: List["ArrowSpec"] = field(default_factory=list)
    texts: List["TextSpec"] = field(default_factory=list)
    anchors: List["AnchorSpec"] = field(default_factory=list)

    # NYE komfort-argumenter (valgfrie):
    rect: Optional["RectSpec"] = None
    circle: Optional["CircleSpec"] = None
    segment: Optional["SegmentSpec"] = None
    arrow: Optional["ArrowSpec"] = None
    text: Optional["TextSpec"] = None

    def __post_init__(self):
        # Løft enkel-argumenter inn i listene, hvis gitt
        if self.rect is not None:
            self.rects.append(self.rect)
        if self.circle is not None:
            self.circles.append(self.circle)
        if self.segment is not None:
            self.segments.append(self.segment)
        if self.arrow is not None:
            self.arrows.append(self.arrow)
        if self.text is not None:
            self.texts.append(self.text)

    @classmethod
    def from_dict(cls, d: dict) -> SceneSpec:
        """Create SceneSpec from dict. Recursively converts plane/rects/circles/segments/arrows/texts dicts to spec objects."""
        if not d:
            return cls()
        d = d.copy()
        
        # Convert plane dict to PlaneSpec if needed
        if 'plane' in d and isinstance(d['plane'], dict):
            d['plane'] = PlaneSpec.from_dict(d['plane'])
        
        # Convert rects list to RectSpec objects if needed
        if 'rects' in d:
            d['rects'] = [RectSpec.from_dict(r) if isinstance(r, dict) else r for r in d['rects']]
        
        # Convert circles list to CircleSpec objects if needed
        if 'circles' in d:
            d['circles'] = [CircleSpec.from_dict(c) if isinstance(c, dict) else c for c in d['circles']]
        
        # Convert segments list to SegmentSpec objects if needed
        if 'segments' in d:
            d['segments'] = [SegmentSpec.from_dict(s) if isinstance(s, dict) else s for s in d['segments']]
        
        # Convert arrows list to ArrowSpec objects if needed
        if 'arrows' in d:
            d['arrows'] = [ArrowSpec.from_dict(a) if isinstance(a, dict) else a for a in d['arrows']]
        
        # Convert texts list to TextSpec objects if needed
        if 'texts' in d:
            d['texts'] = [TextSpec.from_dict(t) if isinstance(t, dict) else t for t in d['texts']]
        
        # Convert anchors list to AnchorSpec objects if needed
        if 'anchors' in d:
            d['anchors'] = [AnchorSpec.from_dict(a) if isinstance(a, dict) else a for a in d['anchors']]
        
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})

    def to_dict(self) -> dict:
        """Serialize to dict. Recursively converts spec objects to dicts."""
        return {
            'plane': self.plane.to_dict() if self.plane else None,
            'rects': [r.to_dict() if hasattr(r, 'to_dict') else r for r in self.rects],
            'circles': [c.to_dict() if hasattr(c, 'to_dict') else c for c in self.circles],
            'segments': [s.to_dict() if hasattr(s, 'to_dict') else s for s in self.segments],
            'arrows': [a.to_dict() if hasattr(a, 'to_dict') else a for a in self.arrows],
            'texts': [t.to_dict() if hasattr(t, 'to_dict') else t for t in self.texts],
            'anchors': [a.to_dict() if hasattr(a, 'to_dict') else a for a in self.anchors],
        }

    # ---------- Snap-punkter ----------
    def snap_points(self) -> List[Tuple[float, float]]:
        """Samler snap-punkter fra alle figurer og ankere (respekterer snap_on flagg)."""
        pts: List[Tuple[float, float]] = []

        # Rektangler (bare hvis snap_on=True)
        for r in self.rects:
            if r.snap_on:
                pts.extend(r.snappoints.values())

        # Sirkler (bare hvis snap_on=True)
        for c in self.circles:
            if c.snap_on:
                pts.extend(c.snappoints.values())

        # Segmenter (bare hvis snap_on=True)
        for seg in self.segments:
            if seg.snap_on:
                pts.append(seg.a)
                pts.append(seg.b)

        # Ankere
        for a in self.anchors:
            if a.kind == AnchorType.POINT and a.point is not None:
                pts.append(a.point)

        # Planet: legg til ankerpunktet (bare hvis snap_on=True)
        if self.plane is not None and self.plane.through is not None and self.plane.snap_on:
            pts.append(self.plane.through)
    
        # Fjern evt. duplikater grovt (innen piksel-presisjon kan du beholde duplikater; ellers dedup)
        # Her lar vi være – ofte uproblematisk for snapping.
        return pts


# ---------------------------
# Task (oppgave)
# ---------------------------

@dataclass
class TaskSpec:
    """
    Full spesifikasjon for en oppgave.
    - task_id: "1", "2", ...
    - title: overskrift
    - scene: geometri/ankerpunkter
    - basis: "xy" eller "np" (primær visningsbasis)
    - expected: liste av ForceSpec
    - initial_forces: liste av TaskForceSpec (ferdigtegnede krefter)
    - mag_relations: valgfrie forholdskrav
    """
    id: str
    title: str
    scene: SceneSpec
    basis: str = "xy"  # "xy" eller "np"
    expected_forces: List[ForceSpec] = field(default_factory=list)
    initial_forces: List[TaskForceSpec] = field(default_factory=list)
    relation_requirements: Optional[RelationRequirement] = None
    tol: Tolerances = field(default_factory=Tolerances)
    short_lines: List[str] = field(default_factory=list)
    help_lines: List[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, d: dict) -> TaskSpec:
        """Create TaskSpec from dict. Recursively converts all nested specs from dicts."""
        if not d:
            return None
        d = d.copy()
        
        # Convert scene dict to SceneSpec if needed
        if 'scene' in d and isinstance(d['scene'], dict):
            d['scene'] = SceneSpec.from_dict(d['scene'])
        
        # Convert expected_forces list to ForceSpec objects if needed
        if 'expected_forces' in d:
            d['expected_forces'] = [ForceSpec.from_dict(f) if isinstance(f, dict) else f for f in d['expected_forces']]
        
        # Convert initial_forces list to TaskForceSpec objects if needed
        if 'initial_forces' in d:
            d['initial_forces'] = [TaskForceSpec.from_dict(f) if isinstance(f, dict) else f for f in d['initial_forces']]
        
        # Convert relation_requirements dict to RelationRequirement if needed
        if 'relation_requirements' in d and isinstance(d['relation_requirements'], dict):
            d['relation_requirements'] = RelationRequirement.from_dict(d['relation_requirements'])
        
        # Convert tol dict to Tolerances if needed
        if 'tol' in d and isinstance(d['tol'], dict):
            d['tol'] = Tolerances.from_dict(d['tol'])
        
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})

    def to_dict(self) -> dict:
        """Serialize to dict. Recursively converts all nested specs to dicts."""
        return {
            'id': self.id,
            'title': self.title,
            'scene': self.scene.to_dict() if self.scene else None,
            'basis': self.basis,
            'expected_forces': [f.to_dict() if hasattr(f, 'to_dict') else f for f in self.expected_forces],
            'initial_forces': [f.to_dict() if hasattr(f, 'to_dict') else f for f in self.initial_forces],
            'relation_requirements': self.relation_requirements.to_dict() if self.relation_requirements else None,
            'tol': self.tol.to_dict() if hasattr(self.tol, 'to_dict') else self.tol,
            'short_lines': self.short_lines,
            'help_lines': self.help_lines,
        }

    def alias_map(self) -> Dict[str, str]:
        """Map alle alias → canonical name."""
        amap: Dict[str, str] = {}
        for fs in self.expected_forces:
            # alias → canonical
            for a in fs.aliases:
                amap[a.lower()] = fs.name
            # valgfritt: map også canonical til seg selv
            amap[fs.name.lower()] = fs.name
        return amap