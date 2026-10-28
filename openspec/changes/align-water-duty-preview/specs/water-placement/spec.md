## ADDED Requirements
### Requirement: Water placement matches real and preview
A schema-v2 water task on the duty page SHALL appear in the responsible member's duty tasks in both live and draft modes.
#### Scenario: Water on duty page
- **WHEN** water is enabled, configured for duty and assigned to the current member
- **THEN** the live and preview board expose it in personal duty tasks.
#### Scenario: Water on second page or legacy dorm
- **WHEN** water is assigned to the second page or the room is legacy
- **THEN** it is not included in personal duty tasks.
