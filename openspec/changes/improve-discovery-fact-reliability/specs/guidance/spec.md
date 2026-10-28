## ADDED Requirements
### Requirement: Discoverable gestures and truthful task facts
The companion SHALL guide available gestures without implying a notification was sent and SHALL distinguish unavailable data from an empty or pending task.
#### Scenario: One task with multiple pending people
- **WHEN** the nudge page opens with one task and multiple pending assignees who have not learned the gesture
- **THEN** the companion hints that vertical swiping changes the person.
#### Scenario: Missing water or task status
- **WHEN** water schedule data or a task status is unavailable
- **THEN** the companion says it cannot confirm instead of inventing an empty or pending state.
#### Scenario: Asking which duties remain
- **WHEN** a member asks which of their tasks are unfinished
- **THEN** the answer omits completed duties, shows pending or unknown states accurately, and does not claim missing water data is complete.
