# main.py
import sys, os
sys.path.append(os.path.dirname(__file__))

import pygame
import math

# --- App utils / engine ---
from utils.settings import (
    WIDTH, HEIGHT, CENTER_X, CENTER_Y, BG_COLOR, GRID_STEP, GRID_COLOR, DRAW_CENTER,
    HIT_LINE_TH, SNAP_ON_DEFAULT, GRID_ON_DEFAULT, GUIDELINES_ON_DEFAULT, MIN_LEN, get_font,
    RIGHT_PANEL_X, RIGHT_LABEL_Y
)
from ui.layout import make_panel
from ui.dialogs import show_feedback, draw_help_dialog, draw_live_feedback
from engine.forces_manager import ForcesManager
from problem.render import Renderer
from problem.tasks import make_tasks
from problem.taskset import TaskSet
from utils.persist import save_state, load_state

SAVE_PATH = os.path.join(os.path.dirname(__file__), "Tegnede krefter.xml")

# Per-oppgave buffer (i minnet). Verdier: {"forces":[ForceDict], "feedback":[str]}
problem_store: dict[str, dict] = {}

# Tilstand
SNAP_ON = SNAP_ON_DEFAULT  # snapping av/på
GRID_ON = GRID_ON_DEFAULT  # vis/skjul rutenett
GUIDELINES_ON = GUIDELINES_ON_DEFAULT  # guidelines av/på
LIVE_HUD_ON = False

# ================ TaskSet/Renderer =================
pygame.init()
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Fysikk – Tegn krefter")
clock = pygame.time.Clock()

tasks = make_tasks()                 # -> list[TaskSpec]
renderer = Renderer(grid=10)
taskset = TaskSet(renderer=renderer)  # TaskSet holds current scene/task

# Forces manager handles all force/textbox state and rendering
fm = ForcesManager(taskset=taskset)

# ================ Helpers =================

def current_pid() -> str:
    """Aktiv oppgave-ID fra TaskSet."""
    return taskset.get_current_task_id()

def snapshot_current_into_store():
    """Ta et øyeblikksbilde av *fullførte* krefter for aktiv oppgave."""
    pid = current_pid()
    problem_store[pid] = {
        "forces": fm.snapshot_to_dicts()
        # feedback lagres ikke – genereres on demand via taskset.check_forces(forces)
    }

def restore_from_store_or_empty(pid: str):
    """Sett opp forces/boxes fra lagret state for gitt oppgave-ID – ellers tom start."""
    blob = problem_store.get(pid)
    if blob and blob.get("forces"):
        fm.restore_from_dicts(blob["forces"])
    else:
        fm.reset_all()

def toggle_snap():
    global SNAP_ON
    SNAP_ON = not SNAP_ON

def toggle_guidelines():
    global GUIDELINES_ON
    GUIDELINES_ON = not GUIDELINES_ON

def toggle_grid():
    global GRID_ON
    GRID_ON = not GRID_ON

def set_grid_off():
    global GRID_ON
    GRID_ON = False

def set_grid_xy():
    global GRID_ON
    GRID_ON = True

def check_answer():
    result = taskset.check_forces(fm.get_forces())
    score = result.get('score', 0.0)
    feedback = result.get('feedback', [])
    overlays = result.get('overlays', {})
    
    # [DEBUG] Print all details from evaluate_task with tolerances and weights
    print("\n" + "="*80)
    print("[DEBUG] check_answer() - Full Evaluation Result with Tolerances & Weights")
    print("="*80)
    
    # Get current task's tolerances
    task = taskset.current  # Use .current property instead of get_current_task()
    if task and hasattr(task, 'tol'):
        tol = task.tol
        print(f"\nTOLERANCES (from task_spec.tol):")
        print(f"  Direction: ±{tol.ang_tol_deg}° (falloff ±{tol.ang_span_deg}°)")
        print(f"  Position:  ±{tol.pos_tol}px (falloff ±{tol.pos_span}px)")
        print(f"  Equilibrium: ±{tol.sumF_tol} (falloff ±{tol.sumF_span})")
        print(f"  Relations: ±{tol.rel_tol} (falloff ±{tol.rel_span})")
    
    # Safe extraction with defaults
    coverage = result.get('coverage')
    eq_score = result.get('equilibrium_score')
    rel_score = result.get('relations_score')
    
    print(f"\nSCORES:")
    print(f"  Final Score:        {score:.4f}")
    cov_str = f"{coverage:.4f}" if coverage is not None else "N/A"
    eq_str = f"{eq_score:.4f}" if eq_score is not None else "N/A"
    rel_str = f"{rel_score:.4f}" if rel_score is not None else "N/A"
    print(f"  Coverage:           {cov_str}")
    print(f"  Equilibrium Score:  {eq_str}")
    print(f"  Relations Score:    {rel_str}")
    
    print(f"\nFEEDBACK ({len(feedback)} items):")
    if feedback:
        for i, msg in enumerate(feedback, 1):
            print(f"  {i}. {msg}")
    else:
        print(f"  (ingen merknader)")
    
    # Print overlays
    overlays = result.get('overlays', {})
    if overlays:
        print(f"\nOVERLAYS:")
        for fb_idx in sorted([k for k in overlays.keys() if isinstance(k, int)]):
            items = overlays[fb_idx]
            print(f"  Feedback {fb_idx}: {len(items)} overlay(s)")
            for ov in items:
                print(f"    - {ov.get('type')}: {ov}")
    
    details = result.get('details', {})
    if details:
        print(f"\nDETAILS ({len(details)} entries):")
        for key, value in details.items():
            if isinstance(value, dict):
                print(f"  [{key}]")
                for subkey, subval in value.items():
                    if isinstance(subval, float):
                        print(f"      {subkey}: {subval:.4f}")
                    elif isinstance(subval, tuple):
                        print(f"      {subkey}: {subval}")
                    else:
                        print(f"      {subkey}: {subval}")
            else:
                print(f"  {key}: {value}")
    
    print("="*80 + "\n")
    
    # Vis feedback-dialog med poengsum, hinttekster og overlays
    show_feedback(screen, score, feedback, overlays=overlays)

def show_problem_help():
    # Vis hjelpedialog for oppgaven
    heading = taskset.get_heading()
    lines = taskset.get_short_lines()
    draw_help_dialog(screen, heading, lines)

def reset_task():
    """Reset all forces and repopulate initial forces for current task."""
    fm.reset_all()

def to_next():  # gå til neste oppgave
    snapshot_current_into_store()
    save_state(SAVE_PATH, problem_store)
    taskset.next()
    pid = current_pid()
    panel.btn_help.set_text(f"Oppgave {pid}")
    restore_from_store_or_empty(pid)

def to_prev():  # gå til forrige oppgave
    snapshot_current_into_store()
    save_state(SAVE_PATH, problem_store)
    taskset.prev()
    pid = current_pid()
    panel.btn_help.set_text(f"Oppgave {pid}")
    restore_from_store_or_empty(pid)

def draw_xy_grid(surf):
    """Globalt XY-rutenett over hele skjermen."""
    if not GRID_ON:
        return
    start_x = CENTER_X % GRID_STEP
    start_y = CENTER_Y % GRID_STEP
    for x in range(start_x, WIDTH, GRID_STEP):
        pygame.draw.line(surf, GRID_COLOR, (x, 0), (x, HEIGHT))
    for y in range(start_y, HEIGHT, GRID_STEP):
        pygame.draw.line(surf, GRID_COLOR, (0, y), (WIDTH, y))

# Panel (venstreside) – knapper og tittel
panel = make_panel(
    on_prev=to_prev,
    on_help=show_problem_help,
    on_next=to_next,

    on_snap=toggle_snap,
    on_guidelines=toggle_guidelines,
    on_grid_off=set_grid_off,
    on_grid_xy=set_grid_xy,

    on_reset=reset_task,
    on_check=check_answer,
)

# Last eksisterende fil (om den finnes)
try:
    loaded = load_state(SAVE_PATH)
    if loaded:
        problem_store.update(loaded)
        restore_from_store_or_empty(current_pid())
    else:
        fm.reset_all()
except Exception:
    fm.reset_all()

# ================ Main loop =================
running = True
while running:
    t = pygame.time.get_ticks()
    screen.fill(BG_COLOR)

    # ===== TEGNINGSREKKEFØLGE (bakgrunn til forgrunn) =====
    
    # 1. Rutenett (under alt)
    draw_xy_grid(screen)

    # 2. Scene fra oppgave (plan, geometri, snap_points, title, short_lines)
    taskset.draw(screen, snap_on=SNAP_ON)

    # 3. Krefter, guidelines, og tekstbokser (delegert til ForcesManager)
    shift_held = bool(pygame.key.get_mods() & pygame.KMOD_SHIFT)
    mouse_pos = pygame.mouse.get_pos()
    fm.update(t)
    fm.draw(screen, snap_on=SNAP_ON, guidelines_on=GUIDELINES_ON,
            plane_angle=taskset.get_plane_angle(), mouse_pos=mouse_pos, shift_held=shift_held)

    # 4. Knapper i panelet
    panel.draw_buttons(
        screen,
        snap_on=SNAP_ON,
        guidelines_on=GUIDELINES_ON,
        grid_on=GRID_ON,
        plane_angle=taskset.get_plane_angle()
    )

    # Hent snap_points fra taskset
    snap_points = taskset.get_snap_points()

    # Events
    for e in pygame.event.get():
        if e.type == pygame.QUIT:
            snapshot_current_into_store()
            try:
                save_state(SAVE_PATH, problem_store)
            finally:
                running = False

        # Panel-knapper
        if panel.handle_event(e):
            continue

        # TAB for å hoppe mellom krefter
        if e.type == pygame.KEYDOWN and e.key == pygame.K_TAB:
            reverse = bool(pygame.key.get_mods() & pygame.KMOD_SHIFT)
            if fm.handle_tab_navigation(reverse=reverse):
                continue

        # Krefter og tekstbokser (delegert til ForcesManager)
        if fm.handle_event(e, snap_points, angle_deg=taskset.get_plane_angle(), snap_on=SNAP_ON):
            continue

    # Live HUD
    if LIVE_HUD_ON:
        result = taskset.check_forces(fm.get_forces())
        score = result.get('score', 0.0)
        feedback = result.get('feedback', [])
        overlays = result.get('overlays', {})
        # Tegn live poengsum og hinttekster i hjørnet (ikke-modal)
        # Collect all overlays from all feedback indices for live display
        all_overlays = []
        for key in overlays.keys():
            if isinstance(key, int):  # Only get integer indices (feedback indices)
                all_overlays.extend(overlays[key])
        draw_live_feedback(screen, score, feedback, 
                          top_right=(WIDTH - 16, HEIGHT - 16),
                          max_width=320, max_lines=6,
                          overlays=all_overlays)

    pygame.display.flip()
    clock.tick(60)

pygame.quit()