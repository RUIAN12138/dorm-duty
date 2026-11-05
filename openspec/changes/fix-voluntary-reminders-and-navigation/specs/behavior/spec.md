## ADDED Requirements
### Requirement: Voluntary tasks do not trigger automatic reminders
The system SHALL exclude self-round tasks from scheduled reminder creation and delivery while preserving explicit member nudges.
#### Scenario: New voluntary round
- **WHEN** a voluntary round advances and a scheduled reminder runs
- **THEN** it does not send or enqueue an automatic reminder for the voluntary tasks.
#### Scenario: Scheduled task and manual nudge
- **WHEN** a scheduled task is due or a roommate sends an explicit nudge
- **THEN** the existing recipient, authorization and delivery rules remain active.
#### Scenario: Old queued reminder
- **WHEN** an already queued scheduled email contains voluntary tasks
- **THEN** those tasks are excluded at delivery and no email is sent if none remain.
### Requirement: Hidden scrollbar appearance and blank navigation
The app SHALL keep content scrollable without rendering native scrollbars and SHALL allow page swipes only on blank regions.
#### Scenario: Expanded calendar list
- **WHEN** a date list exceeds its viewport
- **THEN** the list remains scrollable and does not show a scrollbar.
#### Scenario: Swipe blank space
- **WHEN** a horizontal gesture starts on empty list space
- **THEN** the adjacent page opens without interfering with records, vertical scroll or system edge gestures.
