# ui/dialogs.py
import pygame
import math
from utils.settings import WIDTH, HEIGHT
from utils.settings import get_font

# Dialog state classes
class DialogStateBase:
    """Base class for dialogs with cached background."""
    def __init__(self):
        self.background = None  # Cached background
    
    def cache_background(self, screen):
        """Cache the screen on first draw."""
        if self.background is None:
            self.background = screen.copy()
    
    def draw_background(self, screen):
        """Draw cached background and overlay."""
        screen.blit(self.background, (0, 0))
        overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        overlay.fill((20, 20, 20, 180))
        screen.blit(overlay, (0, 0))

class DraggableDialogState(DialogStateBase):
    """Base class for draggable dialogs."""
    def __init__(self):
        super().__init__()
        self.box_x = 0
        self.box_y = 0
        self.box_w = 0
        self.box_h = 0
        self.dragging = False
        self.drag_off = (0, 0)
    
    def get_rect(self):
        """Get dialog rect."""
        return pygame.Rect(self.box_x, self.box_y, self.box_w, self.box_h)
    
    def handle_drag_event(self, event, drag_start_region=None):
        """
        Handle dragging events. Returns True if event was consumed.
        Args:
            event: pygame event
            drag_start_region: pygame.Rect where dragging can START (None = entire dialog).
                               Once started, dragging continues anywhere.
        """
        if event.type == pygame.MOUSEBUTTONDOWN:
            mx, my = event.pos
            # Only start dragging if in the designated region
            check_rect = drag_start_region if drag_start_region else self.get_rect()
            if check_rect.collidepoint(mx, my):
                self.dragging = True
                self.drag_off = (mx - self.box_x, my - self.box_y)
                return True
        elif event.type == pygame.MOUSEBUTTONUP:
            self.dragging = False
            return True
        elif event.type == pygame.MOUSEMOTION and self.dragging:
            mx, my = event.pos
            self.box_x = max(0, min(WIDTH - self.box_w, mx - self.drag_off[0]))
            self.box_y = max(0, min(HEIGHT - self.box_h, my - self.drag_off[1]))
            return True
        return False

class FeedbackDialogState(DraggableDialogState):
    def __init__(self, pct, lines, overlays=None):
        super().__init__()
        self.pct = pct
        self.lines = lines
        self.overlays = overlays or {}
        self.hint_index = 0
        self.box_x = WIDTH // 2 - 190
        self.box_y = HEIGHT // 2 - 100
        self.box_w = 380
        self.box_h = 200

class HelpDialogState(DraggableDialogState):
    def __init__(self, title, lines):
        super().__init__()
        self.title = title
        self.lines = lines
        self.scroll_offset = 0
        self.box_x = WIDTH // 4
        self.box_y = HEIGHT // 4
        self.box_w = WIDTH // 2
        self.box_h = HEIGHT // 2

def show_feedback(screen, state, event=None):
    """
    Draw feedback dialog and update state based on event.
    Args:
        screen: pygame surface
        state: FeedbackDialogState instance
        event: pygame event or None
    Returns: updated state, or None if should close
    """
    if state is None:
        return None

    font_title = get_font(42)
    font_body = get_font(28)
    font_btn = get_font(24)

    color = (0, 200, 0) if state.pct >= 0.8 else (230, 180, 0) if state.pct >= 0.5 else (220, 50, 50)
    total_hints = len(state.lines)

    # Handle event
    if event:
        if event.type == pygame.KEYDOWN:
            if event.key in (pygame.K_ESCAPE, pygame.K_RETURN):
                return None  # Close dialog
        elif event.type == pygame.MOUSEBUTTONDOWN:
            mx, my = event.pos
            rect = state.get_rect()
            if rect.collidepoint(mx, my):
                if total_hints > 1:
                    btn_rect = pygame.Rect(state.box_x + state.box_w//2 - 80, 
                                          state.box_y + state.box_h - 56, 160, 36)
                    if btn_rect.collidepoint(mx, my):
                        if state.hint_index < total_hints - 1:
                            state.hint_index += 1
                        else:
                            return None  # Close on last hint
                    else:
                        state.handle_drag_event(event)
                else:
                    state.handle_drag_event(event)
            else:
                return None  # Click outside closes
        elif event.type in (pygame.MOUSEBUTTONUP, pygame.MOUSEMOTION):
            state.handle_drag_event(event)

    # Cache and draw background
    state.cache_background(screen)
    state.draw_background(screen)

    # Draw dialog window
    rect = state.get_rect()
    pygame.draw.rect(screen, (245, 245, 245), rect, border_radius=16)
    pygame.draw.rect(screen, (80, 80, 80), rect, width=2, border_radius=16)

    # Title
    title = font_title.render(f"{round(state.pct*100)} % riktig", True, color)
    t_rect = title.get_rect(center=(rect.centerx, rect.y + 40))
    screen.blit(title, t_rect)

    # Hint text
    if state.lines:
        body = font_body.render(state.lines[state.hint_index], True, (30, 30, 30))
        b_rect = body.get_rect(center=(rect.centerx, rect.y + rect.h//2))
        screen.blit(body, b_rect)

    # Next hint button (if multiple hints)
    if total_hints > 1:
        btn_rect = pygame.Rect(state.box_x + state.box_w//2 - 80, 
                              state.box_y + state.box_h - 56, 160, 36)
        pygame.draw.rect(screen, (230, 230, 230), btn_rect, border_radius=8)
        pygame.draw.rect(screen, (90, 90, 90), btn_rect, width=2, border_radius=8)
        label_text = "Neste hint ➜" if state.hint_index < total_hints - 1 else "Ferdig"
        btn_label = font_btn.render(label_text, True, (10, 10, 10))
        l_rect = btn_label.get_rect(center=btn_rect.center)
        screen.blit(btn_label, l_rect)

    return state

def draw_help_dialog(screen, state, event=None):
    """
    Draw help dialog and update state based on event.
    Args:
        screen: pygame surface
        state: HelpDialogState instance
        event: pygame event or None
    Returns: updated state, or None if should close
    """
    if state is None:
        return None

    font_title = get_font(36)
    font_body = get_font(24)

    # Handle event
    if event:
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_ESCAPE:
                return None  # Close dialog
        elif event.type == pygame.MOUSEBUTTONDOWN:
            mx, my = event.pos
            rect = state.get_rect()
            if rect.collidepoint(mx, my):
                # Allow dragging from anywhere in dialog
                state.handle_drag_event(event)
            else:
                return None  # Click outside closes
        elif event.type in (pygame.MOUSEBUTTONUP, pygame.MOUSEMOTION):
            state.handle_drag_event(event)

    # Cache and draw background
    state.cache_background(screen)
    state.draw_background(screen)

    # Dialog rect
    rect = state.get_rect()
    pygame.draw.rect(screen, (245, 245, 245), rect, border_radius=16)
    pygame.draw.rect(screen, (80, 80, 80), rect, width=2, border_radius=16)

    # Title
    ts = font_title.render(state.title, True, (30, 30, 30))
    ts_rect = ts.get_rect(center=(rect.centerx, rect.y + 36))
    screen.blit(ts, ts_rect)

    # Text lines
    y = ts_rect.bottom + 16
    left = rect.x + 24
    right = rect.right - 24
    for line in state.lines or []:
        s = font_body.render(line, True, (30, 30, 30))
        r = s.get_rect()
        if r.width > (right - left):
            pass  # Hard clip if wider
        screen.blit(s, (left, y))
        y += r.height + 8

    return state
