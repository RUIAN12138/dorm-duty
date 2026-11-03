## ADDED Requirements
### Requirement: Contextual next actions and truthful feedback
The frontend SHALL offer contextual next actions while preserving existing layout and business rules.
#### Scenario: Empty calendar list
- **WHEN** the loaded month has no records
- **THEN** the user can return to duty tasks, and can view the previous month only when loaded records confirm it has records.
#### Scenario: Reminder response
- **WHEN** a reminder request succeeds
- **THEN** the feedback identifies the selected person and task only after the response.
#### Scenario: Rate limit or failure
- **WHEN** the service rejects or fails a reminder
- **THEN** feedback does not claim successful delivery, and preserves the selected task for retry.
#### Scenario: Learned gestures
- **WHEN** the user has already learned task switching
- **THEN** reopening the nudge page does not replay the discovery movement; normal dragging and spring recovery remain available.
