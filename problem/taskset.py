from .tasks import TASKS
from .evaluate import evaluate_task
from .render import Renderer
from utils.settings import MIN_LEN
from problem.evaluate import EvaluationResult

class TaskSet:
    def __init__(self, renderer=None):
        self.tasks = TASKS
        self.idx = 0
        self.renderer = renderer or Renderer()

    @property
    def current(self):
        return self.tasks[self.idx]

    def goto(self, i: int): 
        self.idx = max(0, min(i, len(self.tasks)-1))
    
    def next(self): 
        self.goto(self.idx + 1)
    
    def prev(self): 
        self.goto(self.idx - 1)

    def draw(self, canvas, snap_on: bool = False):
        """Draw the current task scene (plane and geometry only).
        
        Parameters:
        - canvas: pygame surface
        - snap_on: whether to show snap points
        
        Note: Force vectors are drawn by main.py directly.
        """
        self.renderer.draw_scene(canvas, self.current, snap_on=snap_on)

    def check_forces(self, forces):
        """Evaluate drawn forces against current task specification."""
        completed_forces = [f for f in forces if f.is_completed(MIN_LEN)]
        result = evaluate_task(self.current, completed_forces)
        return EvaluationResult(result)
    
    # --- Helper methods for main.py ---
    def get_heading(self) -> str:
        """Get task title."""
        return self.current.title
    
    def get_short_lines(self) -> list:
        """Get short instruction lines."""
        return self.current.short_lines
    
    def get_plane_angle(self) -> float:
        """Get plane angle in degrees from current task scene."""
        if self.current.scene.plane is not None:
            return self.current.scene.plane.angle_deg or 0.0
        return 0.0
    
    def get_snap_points(self) -> list:
        """Get all snap points from current scene."""
        return self.current.scene.snap_points()
    
    def get_current_task_id(self) -> str:
        """Get current task ID."""
        return self.current.id

    def populate_initial_forces(self, forces_manager):
        """
        Populate the ForcesManager with initial forces from the current task.
        Called when switching to a new task.
        
        Args:
            forces_manager: ForcesManager instance to populate
        """
        for task_force_spec in self.current.initial_forces:
            forces_manager.add_initial_force(
                anchor=task_force_spec.anchor,
                arrow_base=task_force_spec.arrow_base,
                arrow_tip=task_force_spec.arrow_tip,
                editable=task_force_spec.editable,
                moveable=task_force_spec.moveable,
                name=task_force_spec.name
            )
