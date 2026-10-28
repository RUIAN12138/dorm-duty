## ADDED Requirements
### Requirement: Independent nudge title and elastic page gestures
The title's vertical swipe SHALL not displace or scroll the containing page; empty page regions SHALL retain elastic pull.
#### Scenario: Drag the title down
- **WHEN** a user drags downward over the title
- **THEN** the title gesture controls recipient selection while the containing page stays stationary.
#### Scenario: Pull preview page
- **WHEN** an empty area is pulled
- **THEN** the preview page may deform and its navigation remains in place.
