# engine/forces_manager.py
"""
ForcesManager: Centralized management of forces and associated textboxes.
Handles state, rendering, and event processing for forces in the application.
"""

import pygame
import utils.geometry as vec
from utils.settings import (
    PICKING_DISTANCE_THRESHOLD,HIT_LINE_TH, GRID_STEP, MIN_LEN,
    RIGHT_PANEL_X, RIGHT_PANEL_W, TEXTBOX_FIRST_Y, TEXTBOX_GAP, TEXTBOX_H, TEXTBOX_FONT_SIZE,
    get_font, RIGHT_LABEL_FONT_SIZE, RIGHT_LABEL_Y
)
from ui.textboxes import TextBox
from engine.forces import Force
from utils.persist import forces_to_dicts, dicts_to_forces


class ForcesManager:
    """
    Manages forces and their associated textboxes.
    
    Responsibilities:
    - Maintain lists of Force and TextBox objects
    - Handle state (active index, drawing/dragging)
    - Render forces and textboxes
    - Process pygame events for force interaction
    - Provide API for adding/removing forces
    - Handle serialization/deserialization
    """
    
    def __init__(self, taskset=None):
        self.forces: list[Force] = []
        self.boxes: list[TextBox] = []
        self.active_index: int = 0
        self.num_initial_forces: int = 0  # Track how many forces are initial (pre-drawn)
        self.taskset = taskset  # Reference to TaskSet for populating initial forces
        
        # Ensure we start with one empty force/textbox
        self.add_empty_force_if_needed()
        self.active_index = 0
        if self.boxes:
            self.boxes[self.active_index].active = True
    
    # ============ State Management ============
    
    def add_force(self, anchor, arrow_base, arrow_tip, editable=True, moveable=True) -> Force:
        """
        Add a new force with given geometry.
        
        Args:
            anchor: Starting point (x, y)
            arrow_base: Base of arrow (x, y)
            arrow_tip: Tip of arrow (x, y)
            editable: Whether anchor can be moved
            moveable: Whether arrow can be moved
            
        Returns:
            The created Force object
        """
        f = Force()
        f.anchor = anchor
        f.arrowBase = arrow_base
        f.arrowTip = arrow_tip
        f.editable = editable
        f.moveable = moveable
        f.update_direction_and_length()
        
        self.forces.append(f)
        y = TEXTBOX_FIRST_Y + TEXTBOX_GAP * (len(self.forces) - 1)
        tb = TextBox(RIGHT_PANEL_X, y, RIGHT_PANEL_W, TEXTBOX_H, text=f.name or "", editable=f.editable)
        self.boxes.append(tb)
        
        return f
    
    def add_initial_force(self, anchor, arrow_base, arrow_tip, editable=True, moveable=True, name=None) -> Force:
        """
        Add an initial (pre-drawn) force. Initial forces are inserted at the beginning
        and tracked separately so new user-drawn forces appear after them.
        
        Args:
            anchor: Starting point (x, y)
            arrow_base: Base of arrow (x, y)
            arrow_tip: Tip of arrow (x, y)
            editable: Whether anchor can be moved
            moveable: Whether arrow can be moved
            name: Optional name to set on the force
            
        Returns:
            The created Force object
        """
        f = Force()
        f.anchor = anchor
        f.arrowBase = arrow_base
        f.arrowTip = arrow_tip
        f.editable = editable
        f.moveable = moveable
        f.name = name  # Set name before creating textbox
        f.update_direction_and_length()
        
        # Insert at the position right after existing initial forces
        insert_pos = self.num_initial_forces
        self.forces.insert(insert_pos, f)
        
        # Create textbox at the same position
        y = TEXTBOX_FIRST_Y + TEXTBOX_GAP * insert_pos
        tb = TextBox(RIGHT_PANEL_X, y, RIGHT_PANEL_W, TEXTBOX_H, text=f.name or "", editable=f.editable)
        self.boxes.insert(insert_pos, tb)
        
        self.num_initial_forces += 1
        
        # Adjust active_index if needed
        if self.active_index >= insert_pos:
            self.active_index += 1
        
        # Recalculate y positions for all textboxes
        self._recalculate_textbox_positions()
        
        return f
    
    def _recalculate_textbox_positions(self):
        """Recalculate y positions for all textboxes to ensure proper spacing."""
        for i, tb in enumerate(self.boxes):
            tb.y = TEXTBOX_FIRST_Y + TEXTBOX_GAP * i
    
    def add_empty_force_if_needed(self):
        """Ensure we always have exactly one empty textbox at the end."""
        # If there are no forces, add one
        if not self.forces:
            f = Force()
            self.forces.append(f)
            tb = TextBox(RIGHT_PANEL_X, TEXTBOX_FIRST_Y, RIGHT_PANEL_W, TEXTBOX_H, editable=f.editable)
            self.boxes.append(tb)
            return

        last_f = self.forces[-1]
        # Force is "used" if it has geometry or name
        # (A force with only a name but no geometry is still being edited)
        has_geometry = (last_f.anchor is not None) or (last_f.arrowTip is not None) or (last_f.arrowBase is not None)
        has_name = last_f.name != "" 
        used = has_geometry or has_name   # If either geometry or name is set, consider it used
        
        if not used:
            return  # Don't create new force if current one is incomplete
        
        # Only create new force if the last one is complete
        y = TEXTBOX_FIRST_Y + TEXTBOX_GAP * len(self.forces)
        f = Force()
        self.forces.append(f)
        tb = TextBox(RIGHT_PANEL_X, y, RIGHT_PANEL_W, TEXTBOX_H, editable=f.editable)
        self.boxes.append(tb)

    def select_active(self, index: int):
        """Set the active force/textbox by index."""
        self.active_index = max(0, min(index, len(self.forces) - 1))
        for j, tb in enumerate(self.boxes):
            tb.active = (j == self.active_index)
    
    def update_textbox_for_force(self, force_index: int):
        """Update the textbox text for a given force index."""
        if 0 <= force_index < len(self.forces) and force_index < len(self.boxes):
            force = self.forces[force_index]
            self.boxes[force_index].text = force.name or ""
    
    def reset_all(self):
        """Reset all forces and textboxes to empty state, then repopulate initial forces if taskset is available."""
        self.forces, self.boxes = [], []
        self.num_initial_forces = 0
        
        # Repopulate initial forces from taskset if available
        if self.taskset:
            self.taskset.populate_initial_forces(self)
        
        # Add an empty force/textbox for user drawing
        self.add_empty_force_if_needed()
        self.active_index = self._find_last_editable_index()
        if self.boxes and self.active_index >= 0:
            self.boxes[self.active_index].active = True
    
    def get_forces(self) -> list[Force]:
        """Return list of all forces."""
        return self.forces
    
    def get_completed_forces(self) -> list[Force]:
        """Return list of completed forces (with all geometry set)."""
        return [f for f in self.forces if f.is_completed(MIN_LEN)]
    
    # ============ Serialization ============
    
    def snapshot_to_dicts(self) -> dict:
        """Convert completed forces to serializable format."""
        completed = self.get_completed_forces()
        return forces_to_dicts(completed)
    
    def restore_from_dicts(self, force_dicts: list[dict]):
        """Load forces from serialized format."""
        # Clear forces without repopulating initial forces
        self.forces, self.boxes = [], []
        self.num_initial_forces = 0
        
        if not force_dicts:
            # If no forces to restore, use reset_all to populate initial forces
            self.reset_all()
            return
        
        loaded = dicts_to_forces(force_dicts)
        for i, f in enumerate(loaded):
            self.forces.append(f)
            y = TEXTBOX_FIRST_Y + TEXTBOX_GAP * i
            tb = TextBox(RIGHT_PANEL_X, y, RIGHT_PANEL_W, TEXTBOX_H, text=f.name or "", editable=f.editable)
            self.boxes.append(tb)
        
        self.add_empty_force_if_needed()
        self.active_index = self._find_last_editable_index()
        for j, tb in enumerate(self.boxes):
            tb.active = (j == self.active_index)
    
    # ============ Rendering ============
    
    def draw(self, surf, snap_on: bool = False, guidelines_on: bool = False,
             plane_angle: float = 0.0, mouse_pos=None, shift_held: bool = False):
        """
        Draw all forces and textboxes.
        
        Args:
            surf: Pygame surface
            snap_on: Whether snapping is enabled (for visual feedback if needed)
            guidelines_on: Whether guidelines are enabled
            plane_angle: Current plane angle in degrees
            mouse_pos: Current mouse position for guidelines
            shift_held: Whether SHIFT key is held
        """
        WIDTH, HEIGHT = surf.get_size()
        
        # Draw forces
        for i, f in enumerate(self.forces):
            f.draw(surf, active=(i == self.active_index))
        
        # Draw guidelines for active force
        if self.forces and mouse_pos is not None:
            active = self.forces[self.active_index]
            active.draw_guidelines(surf, mouse_pos, guidelines_on, shift_held,
                                  plane_angle, WIDTH, HEIGHT)
        
        # Draw textbox label
        label_font = get_font(RIGHT_LABEL_FONT_SIZE)
        label_surf = label_font.render("Navn på krefter", True, (30, 30, 30))
        surf.blit(label_surf, (RIGHT_PANEL_X, RIGHT_LABEL_Y))
        
        # Draw textboxes
        for i, (f, tb) in enumerate(zip(self.forces, self.boxes)):
            is_last = (i == len(self.forces) - 1)
            force_empty = (f.anchor is None and f.arrowTip is None and 
                          f.arrowBase is None and (tb.text.strip() == ""))
            tb.can_delete = not (is_last and force_empty)
            
            tb.draw(surf)
            
            # Sync name
            f.name = tb.text.strip()
    
    def update(self, time_ms: int):
        """Update textbox cursors and animation state."""
        for tb in self.boxes:
            tb.update(time_ms)

    def update_hovering(self, pos, active):
        candidates = []  # Liste av (distance, drag_type, requirement_met)

        for force in self.forces:
            # Kandidat 1: anchor (MÅ være innenfor tegningsområde)
            if force.anchor:
                dist = vec.distance(pos, force.anchor)
                if dist <= PICKING_DISTANCE_THRESHOLD:
                    candidates.append((dist,force,"anchor"))
            
            # Kandidat 2: arrowTip 
            if force.moveable and force.arrowTip:
                dist = vec.distance(pos, force.arrowTip)
                if dist <= PICKING_DISTANCE_THRESHOLD:
                    candidates.append((dist,force,"arrowTip"))
            
            # Kandidat 3: body-linje 
            if  force.anchor and force.arrowTip and force.arrowBase:
                dist = vec.dist_point_to_segment(pos, force.arrowBase, force.arrowTip)
                if dist <= HIT_LINE_TH:
                    da=vec.distance(pos, force.arrowTip)
                    db=vec.distance(pos, force.arrowBase)
                    if da*3<db and da<PICKING_DISTANCE_THRESHOLD*2: # Nærmere arrowTip
                        candidates.append((dist,force,"arrowTip"))
                    else:
                        candidates.append((dist,force,"body"))

            # Kandidat 4: anchor-linje
            if  force.anchor and force.arrowTip and force.arrowBase:
                dist = vec.dist_point_to_segment(pos, force.anchor, force.arrowBase)
                if dist <= HIT_LINE_TH:
                    if force.moveable:
                        da=vec.distance(pos, force.anchor)
                        db=vec.distance(pos, force.arrowBase)
                        if da<db:
                            candidates.append((dist,force,"anchor"))
                        else:
                            candidates.append((dist,force,"body"))
                    else: # Can only move body
                        candidates.append((dist,force,"body"))


        # Reset hovering for all forces
        for force in self.forces:
            force.hovering = None
        
        # Velg beste kandidat: prioriter active force, så sorter på avstand
        best = None
        
        # Sorter på avstand først
        if candidates:
            candidates.sort(key=lambda x: x[0])

        # Sjekk om active force er i sortert liste
        for dist, force, drag_type in candidates:
            if force == active:
                best = (dist, force, drag_type)
                break
        
        # Hvis ikke: velg første (minst avstand)
        if not best and candidates:
            best = candidates[0]
                    
        # Sett hovering på beste kandidaten
        if best:
            _, best_force, best_part = best
            best_force.hovering = best_part                    
    # ============ Event Handling ============
    
    def handle_event(self, e, snap_points, angle_deg: float = 0.0, 
                     snap_on: bool = True) -> bool:
        """
        Process pygame events for force interaction.
        
        Args:
            e: pygame event
            snap_points: List of snap points from scene
            angle_deg: Plane angle in degrees
            snap_on: Whether snapping is enabled
            
        Returns:
            True if event was consumed, False otherwise
        """
        # Handle textbox deletion requests
        if e.type == pygame.MOUSEBUTTONDOWN:
            for i, tb in enumerate(self.boxes):
                if tb.can_delete and tb._del_rect.collidepoint(e.pos):
                    self._delete_force(i)
                    return True
        
        # Handle textbox focus
        textbox_handled = False
        for i, tb in enumerate(self.boxes):
            was = tb.active
            if tb.handle_event(e):  # TextBox consumed the event
                if tb.active and not was:
                    self.active_index = i
                textbox_handled = True
                break
        
        if textbox_handled:
            return True
        
        # Handle force interaction events (only if textbox didn't consume)
        if self.forces:
            # Ensure textbox is active
            active = self.forces[self.active_index]
            
            if e.type == pygame.MOUSEBUTTONDOWN:
                self.boxes[self.active_index].active = True
                
                # If force is already drawing, continue
                if active.drawing:
                    active.handle_mouse_down(
                        e.pos, snap_points, angle_deg=angle_deg,
                        step=GRID_STEP, SNAP_ON=snap_on
                    )
                    return True
                
                # Pick force based on hovering state
                # Check if active force was hovered
                picked = self.active_index
                
                if not active.hovering:
                    # Active force wasn't hovered, check other forces
                    for i, f in enumerate(self.forces):
                        if i != self.active_index and f.hovering:
                            picked = i
                            break
                
                if picked != self.active_index:
                    self.select_active(picked)
                    active = self.forces[self.active_index]
                
                # Start drawing/interacting
                pre_draw = active.drawing
                active.handle_mouse_down(
                    e.pos, snap_points, angle_deg=angle_deg,
                    step=GRID_STEP, SNAP_ON=snap_on
                )
                if not pre_draw and active.drawing:
                    active.handle_motion(
                        e.pos, (0, 0), snap_points,
                        angle_deg=angle_deg, GRID_STEP=GRID_STEP, SNAP_ON=snap_on
                    )
                return True
            
            elif e.type == pygame.MOUSEMOTION:
                self.update_hovering(e.pos, active)
                active.handle_motion(
                    e.pos, e.rel, snap_points,
                    angle_deg=angle_deg, GRID_STEP=GRID_STEP, SNAP_ON=snap_on
                )
                return True
            
            elif e.type == pygame.MOUSEBUTTONUP:
                was_drawing = active.drawing
                active.handle_mouse_up(e.pos)

                # Only add empty force if user actually completed a drawing
                # (if drawing was True before, it means user finished intentionally)
                if was_drawing and not active.drawing:
                    self.add_empty_force_if_needed()
                return True
        
        return False
    
    def handle_tab_navigation(self, reverse: bool = False) -> bool:
        """
        Navigate between forces using TAB.
        Returns True if navigation happened, False if can't navigate.
        """
        if not self.forces:
            return False
        
        active = self.forces[self.active_index]
        
        # Don't navigate if force is being interacted with
        if active.drawing or active.dragging:
            return False
        
        # Check if mouse is being pressed
        if any(pygame.mouse.get_pressed()):
            return False
        
        n = len(self.forces)
        next_i = (self.active_index - 1) % n if reverse else (self.active_index + 1) % n
        self.select_active(next_i)
        return True
    
    # ============ Private Methods ============
    
    def _pick_force(self, pos, snap_points) -> int:
        """
        Determine which force was clicked on.
        Returns index of picked force, or index of last empty force if nothing hit.
        """
        active = self.forces[self.active_index]
        
        # Check if active force was hit
        if self._hit_force(active, pos):
            return self.active_index
        
        # Check other forces
        for i, f in enumerate(self.forces):
            if i == self.active_index:
                continue
            if self._hit_force(f, pos):
                return i
        
        return len(self.forces) - 1
    
    def _hit_force(self, f: Force, pos) -> bool:
        """Check if a click position hits a force."""
        if f.anchor and vec.distance(pos, f.anchor) <= 10:
            return True
        if f.arrowTip and vec.distance(pos, f.arrowTip) <= 10:
            return True
        if f.arrowBase and f.arrowTip and vec.dist_point_to_segment(pos, f.arrowBase, f.arrowTip) <= HIT_LINE_TH:
            return True
        return False
    
    def _delete_force(self, index: int):
        """Delete force and textbox at given index."""
        if 0 <= index < len(self.forces):
            del self.forces[index]
            del self.boxes[index]
            
            # Update textbox positions
            for j, b in enumerate(self.boxes):
                b.rect.y = TEXTBOX_FIRST_Y + TEXTBOX_GAP * j
            
            # Ensure we have at least one empty force
            self.add_empty_force_if_needed()
            
            # Update active index
            self.active_index = self._find_last_editable_index()
            if self.boxes and self.active_index >= 0:
                self.boxes[self.active_index].active = True
#                self.active_index = max(0, min(self.active_index, len(self.forces) - 1))
            for j, b in enumerate(self.boxes):
                b.active = (j == self.active_index)
    
    def _find_last_editable_index(self) -> int:
        """
        Find index of first editable force.
        If none are editable, return index of last force (empty slot).
        """
        # Look for last editable force
        for i in range(len(self.forces) - 1, -1, -1):
            if self.forces[i].editable:
                return i
        
        # No editable forces found; return last force (typically empty user slot)
        if self.forces:
            return len(self.forces) - 1
        return 0
