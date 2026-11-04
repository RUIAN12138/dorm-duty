## ADDED Requirements
### Requirement: Latest completion on card back
The card SHALL display the last valid completion person and time without crossing dorm boundaries.
#### Scenario: Flip a task card
- **WHEN** a user activates a task card
- **THEN** its back displays the latest valid completion person and time, or an honest unavailable state.
#### Scenario: Drag the task card
- **WHEN** a short horizontal drag is released
- **THEN** the card returns elastically without switching or flipping.
#### Scenario: Complete a swipe
- **WHEN** a horizontal drag crosses the existing switch threshold
- **THEN** the current card exits and the adjacent card advances.
#### Scenario: Reduced motion
- **WHEN** reduced motion is enabled
- **THEN** card state and switching remain available without animated movement.
