# main.py
import sys
import os
import pygame
import asyncio

# Detect runtime environment
IS_WEB = 'pyodide' in sys.modules or hasattr(sys, '_base_executable') is False
SAVE_PATH = "Tegnede krefter.xml" if IS_WEB else os.path.join(os.path.dirname(__file__), "Tegnede krefter.xml")

sys.path.append(os.path.dirname(__file__))

from engine.snapping import DEBUG_snap_points

from utils.settings import (
    WIDTH, HEIGHT, CENTER_X, CENTER_Y, BG_COLOR, GRID_STEP, GRID_COLOR,
    SNAP_ON_DEFAULT, GRID_ON_DEFAULT, GUIDELINES_ON_DEFAULT, get_font,

)
from ui.layout import make_panel
from ui.dialogs import show_feedback, draw_help_dialog, FeedbackDialogState, HelpDialogState
from engine.render import draw_live_feedback
from engine.forces_manager import ForcesManager
from problem.render import Renderer
from problem.tasks import make_tasks
from problem.taskset import TaskSet
from utils.persist import save_state, load_state

problem_store: dict[str, dict] = {}

# Tilstand
SNAP_ON = SNAP_ON_DEFAULT
GRID_ON = GRID_ON_DEFAULT
GUIDELINES_ON = GUIDELINES_ON_DEFAULT
LIVE_HUD_ON = False

# Dialog state management
feedback_dialog_state = None
help_dialog_state = None

# ================ TaskSet/Renderer =================
pygame.init()
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Fysikk – Tegn krefter")
clock = pygame.time.Clock()

tasks = make_tasks()
renderer = Renderer(grid=10)
taskset = TaskSet(renderer=renderer)

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
    global feedback_dialog_state
    result = taskset.check_forces(fm.get_forces())
    score = result.get('score', 0.0)
    feedback = result.get('feedback', [])
    overlays = result.get('overlays', {})

    # Wrap result i EvaluationResult for å få debug-metodene
    #from problem.evaluate import EvaluationResult
    #result = EvaluationResult(result)
    
    # [DEBUG] For full evaluation details, uncomment below:
    # task = taskset.current
    # print(task.getTolerancesString())
    # print(result.getScoresString())
    # print(result.getFeedbackString())
    # print(result.getOverlaysString())
    #print(result.get('details', {}))
    
    feedback_dialog_state = FeedbackDialogState(score, feedback, overlays)

def show_problem_help():
    global help_dialog_state
    heading = taskset.get_heading()
    lines = taskset.get_short_lines()
    help_dialog_state = HelpDialogState(heading, lines)

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

def draw_grid(surf):
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
async def main_loop():
    global feedback_dialog_state, help_dialog_state

    running = True
    while running:
        t = pygame.time.get_ticks()
        screen.fill(BG_COLOR)

        # ===== TEGNINGSREKKEFØLGE =====
        draw_grid(screen)
        taskset.draw(screen, snap_on=SNAP_ON)

        shift_held = bool(pygame.key.get_mods() & pygame.KMOD_SHIFT)
        mouse_pos = pygame.mouse.get_pos()
        fm.update(t)
        fm.draw(screen, snap_on=SNAP_ON, guidelines_on=GUIDELINES_ON,
                plane_angle=taskset.get_plane_angle(), mouse_pos=mouse_pos, shift_held=shift_held)

        panel.draw_buttons(
            screen,
            snap_on=SNAP_ON,
            guidelines_on=GUIDELINES_ON,
            grid_on=GRID_ON
        )

        snap_points = taskset.get_snap_points()

        # Events
        for e in pygame.event.get():
            if e.type == pygame.QUIT:
                snapshot_current_into_store()
                try:
                    save_state(SAVE_PATH, problem_store)
                finally:
                    running = False
                continue

            # Dialog events block all other input
            if feedback_dialog_state is not None:
                feedback_dialog_state = show_feedback(screen, feedback_dialog_state, event=e)
                continue

            if help_dialog_state is not None:
                help_dialog_state = draw_help_dialog(screen, help_dialog_state, event=e)
                continue

            # Normal input (only if no dialog active)
            if panel.handle_event(e):
                continue

            if e.type == pygame.KEYDOWN and e.key == pygame.K_TAB:
                reverse = bool(pygame.key.get_mods() & pygame.KMOD_SHIFT)
                if fm.handle_tab_navigation(reverse=reverse):
                    continue

            if fm.handle_event(e, snap_points, angle_deg=taskset.get_plane_angle(), snap_on=SNAP_ON):
                continue

        # Draw dialogs (once per frame, no event)
        if feedback_dialog_state is not None:
            feedback_dialog_state = show_feedback(screen, feedback_dialog_state, event=None)

        if help_dialog_state is not None:
            help_dialog_state = draw_help_dialog(screen, help_dialog_state, event=None)


        #DEBUG: Draw snap candidates
        #candidates=DEBUG_snap_points()
        #"if candidates:
        #    for px,py in candidates:
        #        pygame.draw.circle(screen, (55, 55, 55), (px, py), 3)

        # Live HUD
        if LIVE_HUD_ON:
            result = taskset.check_forces(fm.get_forces())
            score = result.get('score', 0.0)
            feedback = result.get('feedback', [])
            overlays = result.get('overlays', {})
            all_overlays = []
            for key in overlays.keys():
                if isinstance(key, int):
                    all_overlays.extend(overlays[key])
            draw_live_feedback(screen, score, feedback, 
                            top_right=(WIDTH - 16, HEIGHT - 16),
                            max_width=320, max_lines=6,
                            overlays=all_overlays)

        pygame.display.flip()
        await asyncio.sleep(1/30)

    pygame.quit()
    if not IS_WEB:  # Unngå sys.exit() i nettleser
        sys.exit()

# Ny robust oppstart
def run():
    if IS_WEB:
        # Pyodide: gjenbruk eksisterende event loop
        try:
            import pyodide  # pyright: ignore[reportMissingImports] # noqa: F401
        except ImportError:
            pass
        loop = asyncio.get_event_loop()
        loop.create_task(main_loop())
    else:
        # Desktop: eksplisitt event loop + Windows policy
        if os.name == "nt":
            try:
                asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
            except AttributeError:
                pass
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(main_loop())
        finally:
            loop.close()

if __name__ == "__main__":
    run()
