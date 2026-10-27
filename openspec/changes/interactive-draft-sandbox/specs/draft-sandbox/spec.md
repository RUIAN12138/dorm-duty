## ADDED Requirements
### Requirement: Real components use a scoped in-memory preview service
The creation preview SHALL operate using real UI with an isolated local service, never production writes.
#### Scenario: Complete and undo
- **WHEN** a valid simulated current task is completed or undone
- **THEN** task status, round progress and calendar SHALL update coherently and existing feedback SHALL run
#### Scenario: Handoff and rollback
- **WHEN** completion rhythm hands off to the next member
- **THEN** the next current task SHALL appear and undo SHALL not rewind a later completed turn
#### Scenario: Forbidden or forged operation
- **WHEN** a real identifier, token, forged assignee, duplicate action or unauthorized task is submitted
- **THEN** the local service SHALL reject or safely ignore it without modifying canonical state
#### Scenario: Retained state
- **WHEN** the user exits/reopens or reorders preview navigation
- **THEN** simulated task state SHALL remain and navigation changes SHALL update the draft
#### Scenario: Local-only actions
- **WHEN** the user tries nudge, chat or a note in preview
- **THEN** the action SHALL use the local provider with no real notification, AI request or storage of task records
