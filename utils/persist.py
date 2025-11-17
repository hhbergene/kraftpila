# utils/persist.py
from __future__ import annotations
from typing import Iterable, Dict, List, Tuple, Any
import os, xml.etree.ElementTree as ET
from xml.dom import minidom

from engine.forces import Force

Point = Tuple[float, float]
ForceDict = Dict[str, Any]
ProblemBlob = Dict[str, Any]   # {"forces": List[ForceDict], "feedback": List[str]}

# ---------- Konvertering ----------

def _pt_to_str(p: Point | None) -> str:
    if not p: return ""
    return f"{float(p[0]):.1f},{float(p[1]):.1f}"

def _str_to_pt(s: str) -> Point | None:
    s = (s or "").strip()
    if not s: return None
    x, y = s.split(",")
    return (float(x), float(y))

def force_to_dict(f: Force) -> ForceDict:
    return {
        "name": f.name or "",
        "anchor": None if f.anchor is None else (float(f.anchor[0]), float(f.anchor[1])),
        "arrowTip": None if f.arrowTip is None else (float(f.arrowTip[0]), float(f.arrowTip[1])),
        "arrowBase": None if f.arrowBase is None else (float(f.arrowBase[0]), float(f.arrowBase[1])),
        "editable": f.editable,
        "moveable": f.moveable,
    }

def dict_to_force(d: ForceDict) -> Force:
    f = Force()
    f.name = d.get("name", "")
    f.anchor = d.get("anchor") or d.get("A")  # fallback for old format
    f.arrowTip = d.get("arrowTip") or d.get("B")  # fallback for old format
    f.arrowBase = d.get("arrowBase") or d.get("C")  # fallback for old format
    f.editable = d.get("editable", True)
    f.moveable = d.get("moveable", True)
    # sørg for konsistent interne felt
    f.drawing = False
    f.dragging = None
    f.update_direction_and_length()
    return f

def forces_to_dicts(forces: Iterable[Force]) -> List[ForceDict]:
    return [force_to_dict(f) for f in forces]

def dicts_to_forces(items: Iterable[ForceDict]) -> List[Force]:
    return [dict_to_force(d) for d in items]

# ---------- Fil I/O (XML) ----------

def save_state(filepath: str, problems: Dict[str, ProblemBlob]) -> None:
    """
    problems: { problem_id: {"forces":[ForceDict,...], "feedback":[str,...]} }
    """
    root = ET.Element("tegnedeKrefter")
    for pid, blob in problems.items():
        e_prob = ET.SubElement(root, "oppgave", {"id": str(pid)})
        # Krefter
        e_forces = ET.SubElement(e_prob, "krefter")
        for fd in blob.get("forces", []):
            e_f = ET.SubElement(e_forces, "kraft", {
                "editable": str(fd.get("editable", True)).lower(),
                "moveable": str(fd.get("moveable", True)).lower(),
            })
            ET.SubElement(e_f, "navn").text = fd.get("name", "")
            ET.SubElement(e_f, "anchor").text = _pt_to_str(fd.get("anchor"))
            ET.SubElement(e_f, "arrowTip").text = _pt_to_str(fd.get("arrowTip"))
            ET.SubElement(e_f, "arrowBase").text = _pt_to_str(fd.get("arrowBase"))
        # Feedback (lagres, men ignoreres ved load)
        #e_fb = ET.SubElement(e_prob, "feedback")
        #for line in blob.get("feedback", []):
        #    ET.SubElement(e_fb, "line").text = line

    # pen prettify
    xml_bytes = ET.tostring(root, encoding="utf-8")
    xml_str = minidom.parseString(xml_bytes).toprettyxml(indent="  ", encoding="utf-8")
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "wb") as f:
        f.write(xml_str)

def load_state(filepath: str) -> Dict[str, ProblemBlob]:
    if not os.path.exists(filepath):
        return {}
    tree = ET.parse(filepath)
    root = tree.getroot()
    out: Dict[str, ProblemBlob] = {}

    for e_prob in root.findall("oppgave"):
        pid = e_prob.attrib.get("id", "").strip() or "1"
        # krefter
        found: List[ForceDict] = []
        e_forces = e_prob.find("krefter")
        if e_forces is not None:
            for e_f in e_forces.findall("kraft"):
                fd: ForceDict = {
                    "name": (e_f.findtext("navn") or "").strip(),
                    "editable": e_f.attrib.get("editable", "true").lower() != "false",
                    "moveable": e_f.attrib.get("moveable", "true").lower() != "false",
                }
                # Nye navn, med fallback til gamle for bakover-kompatibilitet
                fd["anchor"] = _str_to_pt(e_f.findtext("anchor") or "") or _str_to_pt(e_f.findtext("A") or "")
                fd["arrowTip"] = _str_to_pt(e_f.findtext("arrowTip") or "") or _str_to_pt(e_f.findtext("B") or "")
                fd["arrowBase"] = _str_to_pt(e_f.findtext("arrowBase") or "") or _str_to_pt(e_f.findtext("C") or "")
                found.append(fd)

        # feedback (IGNORERES ved lasting, men leses hvis du vil vise historikk andre steder)
        #fb_lines: List[str] = []
        #e_fb = e_prob.find("feedback")
        #if e_fb is not None:
        #    for e_line in e_fb.findall("line"):
        #        fb_lines.append(e_line.text or "")

        out[pid] = {"forces": found}#, "feedback": fb_lines}
    return out
