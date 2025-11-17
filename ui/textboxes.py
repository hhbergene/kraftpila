# ui/textboxes.py

import pygame
from utils.settings import get_font, get_font_stack
from utils.settings import ACTIVE_BG, INACTIVE_BG, BUTTON_ON, BUTTON_OFF, TEXT_COLOR, TEXTBOX_FONT_SIZE
from engine.text_render import render_text

            
class TextBox:
    def __init__(self, x, y, w, h, text=""):
        self.rect = pygame.Rect(x, y, w, h)
        self.text = text
        self.active = False
        self.cursor_visible = True
        self.last_toggle = 0
        self.can_delete = False
        self.request_delete = False
        self._del_rect = pygame.Rect(self.rect.right - 20, self.rect.y + 6, 14, 14)
        self.caret = len(text)
        self.font = get_font(TEXTBOX_FONT_SIZE)

    
    def handle_event(self, e):
        if e.type == pygame.MOUSEBUTTONDOWN:
            if self.can_delete and self._del_rect.collidepoint(e.pos):
                self.request_delete = True
                return True
            if self.rect.collidepoint(e.pos):
                debug_text = self.text[:self.caret] + "|" + self.text[self.caret:]
                print(f"DEBUG TextBox: '{debug_text}'")
                self.active = True
                return True
            else:
                self.active = False
                return False
            return False
        elif e.type == pygame.KEYDOWN and self.active:
            if e.key in (pygame.K_RETURN, pygame.K_ESCAPE):
                self.active = False
                return True
            # Navigering etc. (valgfritt)
            if e.key == pygame.K_LEFT:
                if self.caret > 0:
                    self.caret -= 1
                    # Skip over control chars (_ or ^)
                    while self.caret > 0 and self.text[self.caret] in ("_", "^"):
                        self.caret -= 1
                return True
            if e.key == pygame.K_RIGHT:
                if self.caret < len(self.text):
                    self.caret += 1
                    # Skip over control chars (_ or ^)
                    while self.caret < len(self.text) and self.text[self.caret] in ("_", "^"):
                        self.caret += 1
                return True

            ch = e.unicode

            # Backspace: slett tegn til venstre for caret
            if e.key == pygame.K_BACKSPACE:
                if self.caret > 0:
                    char_to_delete = self.text[self.caret-1]
                    
                    # If deleting a control char (_ or ^), also delete the following {}
                    if char_to_delete in ("_", "^"):
                        # Check if next two chars are {}
                        if (self.caret + 1 < len(self.text) and 
                            self.text[self.caret] == "{" and 
                            self.text[self.caret+1] == "}"):
                            # Delete control char and braces
                            self.text = self.text[:self.caret-1] + self.text[self.caret+2:]
                        else:
                            # Just delete the control char
                            self.text = self.text[:self.caret-1] + self.text[self.caret:]
                    # If trying to delete { or }, do nothing (skip)
                    elif char_to_delete not in ("{", "}"):
                        self.text = self.text[:self.caret-1] + self.text[self.caret:]
                    
                    self.caret -= 1
                return True

            # Delete: slett tegn på caret-posisjon (hvis noe finnes)
            if e.key == pygame.K_DELETE:
                if self.caret < len(self.text):
                    char_to_delete = self.text[self.caret]
                    
                    # If deleting a control char (_ or ^), also delete the following {}
                    if char_to_delete in ("_", "^"):
                        # Check if next two chars are {}
                        if (self.caret + 2 < len(self.text) and 
                            self.text[self.caret+1] == "{" and 
                            self.text[self.caret+2] == "}"):
                            # Delete control char and braces
                            self.text = self.text[:self.caret] + self.text[self.caret+3:]
                        else:
                            # Just delete the control char
                            self.text = self.text[:self.caret] + self.text[self.caret+1:]
                    # If trying to delete { or }, do nothing (skip)
                    elif char_to_delete not in ("{", "}"):
                        self.text = self.text[:self.caret] + self.text[self.caret+1:]
                return True            
            
            if not ch:
                return False

            # Space handling: exit braces if inside, otherwise normal space
            if ch == " ":
                self.text = self.text[:self.caret] + " " + self.text[self.caret:]
                self.caret += 1
                return True

            # Control chars: insert with invisible braces
            if ch in ("_", "^"):
                # Insert control char and braces: a|b -> a_{}|b
                self.text = self.text[:self.caret] + ch + "{}" + self.text[self.caret:]
                self.caret += 2  # Position caret after control char, before {
                return True

            # Regular character insertion
            self.text = self.text[:self.caret] + ch + self.text[self.caret:]
            self.caret += 1
            return True
        
        return False


    def update(self, time_ms):
        if time_ms - self.last_toggle > 350:
            self.cursor_visible = not self.cursor_visible
            self.last_toggle = time_ms

    def _get_caret_mode(self) -> str:
        """
        Determine the current mode at the caret position: 'normal', 'sub', or 'sup'.
        Handles invisible braces {} for grouping sub/superscript content.
        """
        brace_depth = 0
        last_control_before_caret = None
        
        for i in range(self.caret):
            ch = self.text[i]
            if ch == "{":
                brace_depth += 1
            elif ch == "}":
                brace_depth -= 1
                if brace_depth == 0:
                    last_control_before_caret = None
            elif ch in ("_", "^") and brace_depth == 0:
                last_control_before_caret = ch
            elif ch not in ("_", "^", "{", "}") and brace_depth == 0 and ch != " ":
                last_control_before_caret = None
            elif ch == " " and brace_depth == 0:
                last_control_before_caret = None
        
        # If we're inside braces after a control char, set mode
        if brace_depth > 0 and last_control_before_caret:
            return "sub" if last_control_before_caret == "_" else "sup"
        
        # Special case: if we're right before a closing brace and inside braces,
        # check if there's actually a closing brace at caret position
        # a_{12}|} should show as sub, not normal
        if (self.caret < len(self.text) and self.text[self.caret] == "}" and 
            last_control_before_caret and brace_depth == 0):
            # We're at closing brace but haven't counted it yet - we're still "inside"
            return "sub" if last_control_before_caret == "_" else "sup"
        
        return "normal"

    def _calculate_caret_x(self) -> float:
        """Calculate the x position of the caret based on text width up to caret position.
        Accounts for invisible braces and control characters."""
        if self.caret == 0:
            return self.rect.x + 6
        
        # Render text up to caret position to get width
        # This includes invisible braces which don't render
        text_before = self.text[:self.caret]
        surf = render_text(text_before, self.font, True, TEXT_COLOR)
        return self.rect.x + 6 + surf.get_width()

    def draw(self, surf):
        color = ACTIVE_BG if self.active else INACTIVE_BG
        pygame.draw.rect(surf, color, self.rect, border_radius=6)
        pygame.draw.rect(surf, (80, 80, 80), self.rect, 2, border_radius=6)
        
        # Draw the text without caret
        txt = self.text
        text_surf = render_text(txt, self.font, True, TEXT_COLOR)
        text_x = self.rect.x + 6
        text_y = self.rect.y
        surf.blit(text_surf, (text_x, text_y))
        
        # Draw caret on top if active
        if self.active and self.cursor_visible:
            caret_x = self._calculate_caret_x()
            caret_mode = self._get_caret_mode()
            
            # Adjust caret y position based on mode
            caret_color = (100, 100, 255)  # Light blue caret
            caret_height = self.font.get_height()*0.8
            caret_y = text_y+caret_height*0.25
            
            if caret_mode == "sup":
                caret_y -= int(0.04 * caret_height)  # Raise for superscript
                caret_height = int(caret_height * 0.5)
            elif caret_mode == "sub":
                caret_y += int(0.80 * caret_height)  # Lower for subscript
                caret_height = int(caret_height * 0.5)
            
            # Draw vertical line caret
            pygame.draw.line(surf, caret_color, (caret_x, caret_y), (caret_x, caret_y + caret_height), 2)
        
        
        # Delete cross
        self._del_rect = pygame.Rect(self.rect.right - 20, self.rect.y + 6, 14, 14)
        if self.can_delete:
            pygame.draw.rect(surf, (230,230,230), self._del_rect, border_radius=3)
            pygame.draw.rect(surf, (120,120,120), self._del_rect, 1, border_radius=3)
            x1, y1 = self._del_rect.left + 3, self._del_rect.top + 3
            x2, y2 = self._del_rect.right - 3, self._del_rect.bottom - 3
            pygame.draw.line(surf, (60,60,60), (x1,y1), (x2,y2), 2)
            pygame.draw.line(surf, (60,60,60), (x1,y2), (x2,y1), 2)

