# ./problem/tasks.py
from __future__ import annotations
from typing import Dict

import utils.geometry as vec
from utils.settings import GRID_STEP, DRAW_CENTER, UP, DOWN, LEFT, RIGHT, FORCE_DRAW_LIMIT_LEFT

from .spec import (
    TaskSpec,
    SceneSpec,
    PlaneSpec,
    SegmentSpec,
    ArrowSpec,
    TextSpec,
    CircleSpec,
    RectSpec,
    ForceSpec,
    TaskForceSpec,
    AnchorSpec,
    AnchorType,
    RelationRequirement,
    MagnitudeRelation,
    MagTerm,
)


# Note: PLANE_Y, RECT_W, RECT_H importert fra settings.py

# ------------------------------------------------------------
# Oppgave 1: Flatt plan, i ro, uten friksjon (G og N)
# ------------------------------------------------------------

def make_task_1() -> TaskSpec:
    wA = GRID_STEP * 8
    hA = GRID_STEP * 6
    
    plane = PlaneSpec(angle_deg=0.0, through=DRAW_CENTER)
    rect  = RectSpec(position=DRAW_CENTER, width=wA, height=hA, position_kind="bottom_center")

    forces: Dict[str, ForceSpec] = {
        "G": ForceSpec(
            name="G",
            aliases={"g", "ga", "tyngde", "fg", "G"},
            dir_unit=DOWN,   # ned
            anchor=AnchorSpec(
                kind=AnchorType.POINT,
                point=rect.center
            ),
        ),
        "N": ForceSpec(
            name="N",
            aliases={"n", "na", "normalkraft", "r", "fn", "N"},
            dir_unit=plane.n_vec,           # opp fra planet (normal-vektor)
            anchor=AnchorSpec(
                kind=AnchorType.SEGMENT,
                segment=(rect.left_bottom, rect.right_bottom)  # kontaktflate
            ),
        )
    }
    relation_requirements = RelationRequirement(
        relations=[MagnitudeRelation(
            lhs=[MagTerm("G")],
            rhs=[MagTerm("N")],
            ratio=1.0,
            tol_rel=0.15
        )],
        basis="xy"
    )
    
    return TaskSpec(
        id="1",
        title="Kloss på flatt plan uten friksjon",
        short_lines = ["Tegn kreftene som virker på A.","v=0 (konstant)"],
        help_lines = [
            "En kloss A ligger i ro på et flatt underlag.",
            "Tegn kreftene som virker på klossen.",
        ],
        scene=SceneSpec(plane=plane, rect=rect),
        expected_forces=forces,
        relation_requirements=relation_requirements
    )

def make_task_2() -> TaskSpec:
    wA = GRID_STEP * 8
    hA = GRID_STEP * 6
    
    plane = PlaneSpec(angle_deg=0.0, through=DRAW_CENTER)
    rect  = RectSpec(position=DRAW_CENTER, width=wA, height=hA, position_kind="bottom_center")

    forces: Dict[str, ForceSpec] = {
        "F": ForceSpec(
            name="F",
            aliases={"f", "fa", "kraft", "applied"},
            dir_unit=RIGHT,    # til høyre
            anchor=AnchorSpec(
                kind=AnchorType.SEGMENT,
                segment=(rect.right_bottom, rect.right_top)
            ),
        ),
        "G": ForceSpec(
            name="G",
            aliases={"g", "ga", "tyngde", "fg"},
            dir_unit=DOWN,   # ned
            anchor=AnchorSpec(
                kind=AnchorType.POINT,
                point=rect.center
            ),
        ),
        "N": ForceSpec(
            name="N",
            aliases={"n", "na", "normalkraft", "r", "fn"},
            dir_unit=plane.n_vec,           # opp fra planet (normal-vektor)
            anchor=AnchorSpec(
                kind=AnchorType.SEGMENT,
                segment=(rect.left_bottom, rect.right_bottom)  # kontaktflate
            ),
        ),
        "R": ForceSpec(
            name="R",
            aliases={"r", "ra", "friksjon", "fr"},
            dir_unit=LEFT,   # mot venstre (mot bevegelse)
            anchor=AnchorSpec(
                kind=AnchorType.SEGMENT,
                segment=(rect.right_bottom, rect.left_bottom)
            ),
        )
    }
    relation_requirements = RelationRequirement(
        relations=[
            # G/N = 1.0 (gravity magnitude / normal force magnitude)
            MagnitudeRelation(
                lhs=[MagTerm("G")],
                rhs=[MagTerm("N")],
                ratio=1.0,
                tol_rel=0.15
            ),
            # F/R = 1.0 (applied force / friction force)
            MagnitudeRelation(
                lhs=[MagTerm("F")],
                rhs=[MagTerm("R")],
                ratio=1.0,
                tol_rel=0.15
            )
        ]
    )

    return TaskSpec(
        id="2",
        title="Vi drar en kloss med kraften F",
        short_lines = ["Tegn de andre kreftene som virker på A.", "v = konstant"],
        help_lines  = [
            "En kloss A ligger på et flatt underlag og trekkes av en kraft F,",
            "slik at den beveger seg mot høyre med konstant fart.",
            "Tegn kreftene som virker på klossen.",
        ],
        scene=SceneSpec(plane=plane, rect=rect),
        expected_forces=forces,
        relation_requirements=relation_requirements,
        initial_forces=[
            TaskForceSpec(
                anchor=rect.right_middle,
                arrow_base=rect.right_middle,
                arrow_tip=vec.add(rect.right_middle, (3*GRID_STEP, 0)),
                name="F",
                editable=False,
                moveable=False
            )
        ]
    )


def make_task_3() -> TaskSpec:
    # --- Geometri ---
    wA = GRID_STEP * 8
    hA = GRID_STEP * 6
    
    bottom_center_A = DRAW_CENTER
    
    plane = PlaneSpec(
        through=bottom_center_A,
        angle_deg=0.0
    )

    rectA = RectSpec(
        position=bottom_center_A,
        width=wA,
        height=hA,
        position_kind="bottom_center",
        normal_vector=plane.n_vec
    )

    wB = GRID_STEP * 6
    hB = GRID_STEP * 4
    # Kloss B skal ligge oppå A: bottom_center_B = top_center_A
    bottom_center_B = rectA.top_center

    rectB = RectSpec(
        position=bottom_center_B,
        width=wB,
        height=hB,
        position_kind="bottom_center"
    )

    scene = SceneSpec(
        plane=plane,
        rects=[rectA, rectB],
    )

    # --- Forventede krefter på A ---
    expected = [
        # G_A: ned, angrepspunkt senter av A
        ForceSpec(
            name="G",
            aliases={"g", "ga", "fg", "tyngde"},
            anchor=AnchorSpec(kind=AnchorType.POINT, point=rectA.center),
            dir_unit=DOWN,   # ned (skjerm-koord: +y)
        ),
        # N (fra underlaget på A): opp, langs bunnsegmentet til A
        ForceSpec(
            name="N",
            aliases={"n", "na", "fn", "normalkraft", "r"},
            anchor=AnchorSpec(kind=AnchorType.SEGMENT, segment=rectA.bottom),
            dir_unit=UP,   # opp (skjerm-koord: -y)
        ),
        # Nb (fra B på A): ned, langs toppsegmentet til A
        ForceSpec(
            name="N_B",
            aliases={"nb*","n*","nb'","n'", "b", "nba", "nab"},
            anchor=AnchorSpec(kind=AnchorType.SEGMENT, segment=rectA.top),
            dir_unit=DOWN,   # ned (B trykker A ned ovenfra)
        ),
    ]

    relation_requirements = RelationRequirement(
        relations=[
            # G = N + Nb (force balance: weight equals sum of normal forces)
            MagnitudeRelation(
                lhs=[MagTerm("G"),MagTerm("Nb")],
                rhs=[MagTerm("N")],
                ratio=1.0,
                tol_rel=0.15
            ),
            # G/Nb = 2 (since m_A = 2*m_B, so G_A = 2*G_B = 2*Nb)
            MagnitudeRelation(
                lhs=[MagTerm("G")],
                rhs=[MagTerm("Nb")],
                ratio=2.0,
                tol_rel=0.15
            )
        ]
    )

    return TaskSpec(
        id="3",
        title="To klosser oppå hverandre i ro på flatt plan",
        scene=scene,
        basis="xy",
        expected_forces=expected,
        relation_requirements=relation_requirements,
        short_lines=[
            "Tegn kreftene som virker på A.",
            "v = 0",
            "m_A = 2 · m_B",
        ],
        help_lines=[
            "To klosser A og B ligger i ro på et flatt underlag.",
            "Kloss A er dobbelt så tung som kloss B (m_A = 2 · m_B).",
            "Tegn kreftene som virker på kloss A.",
            "Kreftene som virker på kloss B er allerede tegnet.",
        ],
    )

# ------------------------------------------------------------
# Oppgave 4: Skråplan uten friksjon (G og N)
# ------------------------------------------------------------
def make_task_4() -> TaskSpec:
    wA = GRID_STEP * 8
    hA = GRID_STEP * 6
    
    plane = PlaneSpec(angle_deg=25.0, through=DRAW_CENTER)
    rect  = RectSpec(position=DRAW_CENTER, width=wA, height=hA, normal_vector=plane.n_vec, position_kind="bottom_center")

    forces: Dict[str, ForceSpec] = {
        "G": ForceSpec(
            name="G",
            aliases={"g", "ga", "tyngde", "fg", "G"},
            dir_unit=DOWN,
            anchor=AnchorSpec(kind=AnchorType.POINT, point=rect.center),
        ),
        "N": ForceSpec(
            name="N",
            aliases={"n", "na", "normalkraft", "r", "fn", "N"},
            dir_unit=plane.n_vec,
            anchor=AnchorSpec(kind=AnchorType.SEGMENT, segment=(rect.left_bottom, rect.right_bottom)),
        ),
    }

    relation_reqs = RelationRequirement(
        relations=[
            # G_n / N ≈ 1 (G component normal to plane / N magnitude)
            MagnitudeRelation(
                lhs=[MagTerm(force_name="G", e_vec=plane.n_vec,sign=-1)],
                rhs=[MagTerm(force_name="N")], 
                ratio=1.0,
                tol_rel=0.15
            )
        ]
    )

    return TaskSpec(
        id="4",
        title="Kloss på skråplan",
        scene=SceneSpec(plane=plane, rect=rect),
        basis="np",
        expected_forces=forces,
        relation_requirements=relation_reqs,
        short_lines=["Tegn kreftene som virker på A.", "μ = 0"],
        help_lines=[
            "Kloss A sklir på et skråplan uten friksjon.",
            "Tegn kreftene som virker på klossen.",
        ],
    )

# ------------------------------------------------------------
# Oppgave 5: Skråplan med friksjon (G, N og R)
# ------------------------------------------------------------

def make_task_5() -> TaskSpec:
    wA = GRID_STEP * 8
    hA = GRID_STEP * 6
    
    plane = PlaneSpec(n_vec=(-1.,-2.), through=DRAW_CENTER)
    rect  = RectSpec(position=DRAW_CENTER, width=wA, height=hA, 
                     position_kind="bottom_center", 
                     normal_vector=plane.n_vec)
    
    forces: Dict[str, ForceSpec] = {
        "G": ForceSpec(
            name="G",
            aliases={"g", "ga", "tyngde", "fg", "G"},
            dir_unit=DOWN,
            anchor=AnchorSpec(kind=AnchorType.POINT, point=rect.center),
        ),
        "N": ForceSpec(
            name="N",
            aliases={"n", "na", "normalkraft", "r", "fn", "N"},
            dir_unit=plane.n_vec,
            anchor=AnchorSpec(
                kind=AnchorType.SEGMENT,
                segment=(rect.left_bottom, rect.right_bottom)
            ),
        ),
        "R": ForceSpec(
            name="R",
            aliases={"r", "ra", "friksjonskraft", "R"},
            dir_unit=plane.p_vec,
            anchor=AnchorSpec(
                kind=AnchorType.SEGMENT,
                segment=(rect.left_bottom, rect.right_bottom)
            ),
        )
    }
    relation_requirements = RelationRequirement(
        relations=[
            MagnitudeRelation(
                lhs=[MagTerm("G",plane.n_vec,sign=-1)],
                rhs=[MagTerm("N")],
                ratio=1.0,
                tol_rel=0.15
            ),
            MagnitudeRelation(
                lhs=[MagTerm("G",plane.p_vec,sign=-1)],
                rhs=[MagTerm("R")],
                ratio=1.0,
                tol_rel=0.15
            )
        ]
    )


    return TaskSpec(
        id="5",
        title="Kloss på skråplan med friksjon",
        short_lines = ["Tegn kreftene som virker på A.", "v = konstant"],
        help_lines  = [
            "En kloss A sklir nedover et skråplan med konstant fart.",
            "Tegn kreftene som virker på klossen.",
        ],
        scene=SceneSpec(plane=plane, rect=rect),
        expected_forces=forces,
        relation_requirements=relation_requirements,
    )

# ------------------------------------------------------------
# Oppgave 6: Bil i sving med friksjon (G, N og R)
# ------------------------------------------------------------

def make_task_6() -> TaskSpec:
    wA = GRID_STEP * 8
    hA = GRID_STEP * 6
    
    plane = PlaneSpec(angle_deg=0, through=DRAW_CENTER)
    rect  = RectSpec(position=vec.add(DRAW_CENTER,(GRID_STEP*10,0)), width=wA, height=hA, 
                     position_kind="bottom_center", 
                     normal_vector=plane.n_vec,snap_on=True)
    windshield = RectSpec(position=vec.add(rect.center,(0,0)), width=wA-GRID_STEP, height=(hA-GRID_STEP)//2, position_kind="bottom_center",fill_color=(100,200,255), snap_on=False)
    headlight_left = CircleSpec(center=vec.add(rect.center, (-GRID_STEP*2, +GRID_STEP)), radius=GRID_STEP//2, snap_on=False,color=(155,155,0), fill_color=(255,255,0))
    headlight_right = CircleSpec(center=vec.add(rect.center, (GRID_STEP*2, +GRID_STEP)), radius=GRID_STEP//2, snap_on=False,color=(155,155,0), fill_color=(255,255,0))
    road = SegmentSpec(a=vec.add(rect.left_bottom,(-wA,2)),
                        b=vec.add(rect.right_bottom,(+wA,2)),
                        color=(25, 25, 25),snap_on=False)
    arrow_radius = ArrowSpec(a=vec.add(rect.center,(0,hA*0.8)),
                       b=vec.add(rect.center,(-GRID_STEP*20,hA*0.8)),
                       color=(0, 0, 255),body="dashed",snap_on=False)
    text_radius = TextSpec(txt="Til sentrum av sirkelbevegelsen",pos=vec.add(rect.center,(-GRID_STEP*10,hA*1.5+GRID_STEP//2)),
                           size=10,
                           color=(0,0,255),
                           align="center")
    scene=SceneSpec(plane=plane, rects=[rect,windshield], segments=[road], circles=[headlight_left, headlight_right], arrows=[arrow_radius], texts=[text_radius])
    forces: Dict[str, ForceSpec] = {
        "G": ForceSpec(
            name="G",
            aliases={"g", "ga", "tyngde", "fg", "G"},
            dir_unit=DOWN,
            anchor=AnchorSpec(kind=AnchorType.POINT, point=rect.center),
        ),
        "N": ForceSpec(
            name="N",
            aliases={"n", "na", "normalkraft", "r", "fn", "N"},
            dir_unit=plane.n_vec,
            anchor=AnchorSpec(
                kind=AnchorType.SEGMENT,
                segment=(rect.left_bottom, rect.right_bottom)
            ),
        ),
        "R": ForceSpec(
            name="R",
            aliases={"r", "ra", "friksjonskraft", "R"},
            dir_unit=LEFT,
            anchor=AnchorSpec(
                kind=AnchorType.SEGMENT,
                segment=(rect.left_bottom, rect.right_bottom)
            ),
        )
    }
    relation_requirements = RelationRequirement(
        relations=[
            MagnitudeRelation(
                lhs=[MagTerm("G",plane.n_vec,sign=-1)],
                rhs=[MagTerm("N",plane.n_vec)],
                ratio=1.0,
                tol_rel=0.15
            ),
            # MagnitudeRelation(
            #     lhs=[MagTerm("G",plane.p_vec)],
            #     rhs=[MagTerm("R")],
            #     ratio=2.0,
            #     tol_rel=0.15
            # )
        ]
    )


    return TaskSpec(
        id="6",
        title="Bil i sving med friksjon",
        short_lines = ["Tegn kreftene som virker på bilen.", "v = konstant", ""],
        help_lines  = [
            "En bil kjører mot oss med konstant banefart.",
            "Tegn kreftene som virker på bilen.",
        ],
        scene=scene,
        expected_forces=forces,
        relation_requirements=relation_requirements,
    )

# ------------------------------------------------------------
# Oppgave 7: Dossert sving uten friksjon (G og N)
# ------------------------------------------------------------
def make_task_7() -> TaskSpec:
    id="7"
    title="Bil i dossert sving uten friksjon"
    short_lines = ["Tegn kreftene som virker på bilen.", "v = konstant", "μ = 0"]
    help_lines=[
        "En bil kjører mot oss med konstant banefart",
        "i en dossert sving uten friksjon uten å skli.",
        "Tegn kreftene som virker på bilen.",
    ]

    wA = GRID_STEP * 8
    hA = GRID_STEP * 6
    road_center = vec.add(DRAW_CENTER,(GRID_STEP*10,0))
    plane = PlaneSpec(angle_deg=15.0, through=road_center,visible=False,snap_on=False)
    rect  = RectSpec(position=road_center, width=wA, height=hA, 
                     position_kind="bottom_center", 
                     normal_vector=plane.n_vec,snap_on=True)
    windshield = RectSpec(position=vec.add(rect.center,(0,0)), width=wA-GRID_STEP, height=(hA-GRID_STEP)//2, 
                          position_kind="bottom_center",normal_vector=plane.n_vec, fill_color=(100,200,255), snap_on=False)
    headlight_left = CircleSpec(center=vec.add(rect.center, vec.add(vec.scale(plane.p_vec, -GRID_STEP*2), vec.scale(plane.n_vec, -GRID_STEP))),
                                               radius=GRID_STEP//2, snap_on=False,color=(155,155,0), fill_color=(255,255,0))
    headlight_right = CircleSpec(center=vec.add(rect.center, vec.add(vec.scale(plane.p_vec, +GRID_STEP*2), vec.scale(plane.n_vec, -GRID_STEP))),
                                                radius=GRID_STEP//2, snap_on=False,color=(155,155,0), fill_color=(255,255,0))
    road = SegmentSpec(a=vec.add(rect.left_bottom,vec.scale(plane.p_vec, -wA)),
                       b=vec.add(rect.right_bottom,vec.scale(plane.p_vec,+wA)),
                       color=(0, 0, 255),snap_on=False)
    y = road.a[1]
    left_x = FORCE_DRAW_LIMIT_LEFT
    ground = SegmentSpec(a=(left_x,y),
                       b=road.a,
                       color=(0, 0, 255),snap_on=False)
    y+=+hA*0.8
    arrow_radius = ArrowSpec(a=(left_x,y),
                       b=(road.a[0],y),
                       color=(0, 0, 255),body="dashed",snap_on=False)
    text_radius = TextSpec(txt="Til sentrum av sirkelbevegelsen",pos=vec.add(rect.center,(-GRID_STEP*10,hA*1.5+GRID_STEP//2)),
                           size=10,
                           color=(0,0,255),
                           align="center")
    scene=SceneSpec(plane=plane, rects=[rect,windshield], segments=[road,ground], circles=[headlight_left, headlight_right],  arrows=[arrow_radius], texts=[text_radius])

    forces: Dict[str, ForceSpec] = {
        "G": ForceSpec(
            name="G",
            aliases={"g", "ga", "tyngde", "fg", "G"},
            dir_unit=DOWN,
            anchor=AnchorSpec(kind=AnchorType.POINT, point=rect.center),
        ),
        "N": ForceSpec(
            name="N",
            aliases={"n", "na", "normalkraft", "r", "fn", "N"},
            dir_unit=plane.n_vec,
            anchor=AnchorSpec(kind=AnchorType.SEGMENT, segment=(rect.left_bottom, rect.right_bottom)),
        ),
    }

    relation_requirement = RelationRequirement(
        relations=[
            # G_n / N ≈ 1 (G component normal to plane / N magnitude)
            MagnitudeRelation(
                lhs=[MagTerm(force_name="N", e_vec=(0,-1),sign=+1)],
                rhs=[MagTerm(force_name="G")], 
                ratio=1.0,
                tol_rel=0.15
            )
        ]
    )

    return TaskSpec(
        id=id,
        title=title,
        scene=scene,
        basis="xy",
        expected_forces=forces,
        relation_requirements=relation_requirement,
        short_lines=short_lines,
        help_lines=help_lines,
    )


# ------------------------------------------------------------
# Eksporter oppgavesett
# ------------------------------------------------------------


# Valgfri enkel tilgang etter id
def task_by_id(task_id: str) -> TaskSpec:
    for t in TASKS:
        if t.id == task_id:
            return t
    raise KeyError(f"Fant ikke TaskSpec med id={task_id!r}")

TASKS = [
        make_task_1(),
        make_task_2(),
        make_task_3(),
        make_task_4(),
        make_task_5(),
        make_task_6(),
        make_task_7(),
        ]

def make_tasks():
    return TASKS