# utils/persist.py
from __future__ import annotations
from typing import Iterable, Dict, List, Tuple, Any
import os
import sys
import json

from engine.forces import Force

Point = Tuple[float, float]
ForceDict = Dict[str, Any]
ProblemBlob = Dict[str, Any]   # {"forces": List[ForceDict], "feedback": List[str]}

# ---------- Runtime detection ----------
IS_WEB = 'pyodide' in sys.modules

# Initialize storage backend
_storage = None
if IS_WEB:
    try:
        import js # type: ignore
        _storage = js.localStorage
    except ImportError:
        _storage = None

# ---------- Konvertering ----------
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

# ---------- Fil I/O (JSON) ----------

def save_state(filepath: str, data: Dict[str, ProblemBlob]) -> None:
    """
    Save state to file (standalone) or localStorage (web).
    data: { problem_id: {"forces":[ForceDict,...], "feedback":[str,...]} }
    """
    try:
        json_str = json.dumps(data)
        
        if IS_WEB and _storage:
            # Web version: use localStorage
            _storage.setItem(filepath, json_str)
        else:
            # Standalone version: use file
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(json_str)
    except Exception as e:
        print(f"Error saving state: {e}")

def load_state(filepath: str) -> Dict[str, ProblemBlob] | None:
    """
    Load state from file (standalone) or localStorage (web).
    Returns dict or None if not found.
    """
    try:
        if IS_WEB and _storage:
            # Web version: load from localStorage
            data = _storage.getItem(filepath)
            return json.loads(data) if data else None
        else:
            # Standalone version: load from file
            if os.path.exists(filepath):
                with open(filepath, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return None
    except Exception as e:
        print(f"Error loading state: {e}")
        return None
