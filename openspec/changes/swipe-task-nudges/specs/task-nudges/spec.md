## ADDED Requirements
### Requirement: Swipe task titles to choose a nudge
The second page SHALL show task nudges without visible task-switch buttons and SHALL preserve existing notification rules.
#### Scenario: Swipe and cancel
- **WHEN** the user swipes the large title horizontally beyond the threshold
- **THEN** the adjacent task SHALL become active without sending a nudge
- **AND** vertical or cancelled gestures SHALL not select or send
#### Scenario: First discovery
- **WHEN** a multi-task nudge page first appears
- **THEN** the companion SHALL explain swiping and a subtle title movement MAY reveal the adjacent title
- **AND** reduced motion SHALL suppress movement
#### Scenario: Nudge another task
- **WHEN** the user taps the selected pending roommate's nudge surface
- **THEN** the existing endpoint, authorization and throttling SHALL remain in force
- **AND** a response for another task SHALL not appear as the active task's result
#### Scenario: Preserved operations and isolation
- **WHEN** the task belongs to the current user or the page is a preview
- **THEN** original completion/detail operations SHALL remain available without changing legacy data
- **AND** preview SHALL never issue real notifications

### Requirement: Discovery and completion cooperate
The discovery cue SHALL yield to completion and resume after handoff finishes.
#### Scenario: Complete while discovery is moving
- **WHEN** the user presses completion during the discovery cue
- **THEN** the cue SHALL pause at its current position while the completion and handoff run
- **AND** it SHALL return naturally afterwards without duplicating the completion
- **AND** manual swipe or reduced motion SHALL take priority over the deferred return
