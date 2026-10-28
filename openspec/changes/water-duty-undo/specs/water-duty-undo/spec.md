## ADDED Requirements
### Requirement: Water undo remains reachable on duty page
A schema-v2 water task placed on the duty page SHALL retain its existing undo action after handoff while the server permits undo.
#### Scenario: Handoff and refresh
- **WHEN** a member completes water and another member receives the next turn
- **THEN** the completed task remains available as an undo action on the duty page after refresh, in live and preview modes.
#### Scenario: Undo no longer allowed
- **WHEN** the server no longer permits undo due to later completion
- **THEN** no stale undo task is offered on the duty page.
