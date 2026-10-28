## ADDED Requirements
### Requirement: Discover nudge gestures
The companion SHALL provide contextual gesture guidance without repeatedly disturbing users after successful actions.
#### Scenario: Multiple assignees
- **WHEN** the active task has multiple pending assignees and the user has not learned the gesture
- **THEN** the companion explains vertical navigation without sending a reminder.
### Requirement: Ground answers in authenticated facts
Identity and task answers SHALL use current authenticated facts and distinguish unknown data from empty data.
#### Scenario: Query a task
- **WHEN** the user asks about a known current task
- **THEN** the answer uses the available round or assignment and does not invent history.
### Requirement: Practice actual controls safely
The guided tutorial SHALL advance on actual interactions using isolated practice data.
#### Scenario: Select reminder recipient
- **WHEN** a learner swipes to another eligible person
- **THEN** the lesson advances without sending real notifications.
