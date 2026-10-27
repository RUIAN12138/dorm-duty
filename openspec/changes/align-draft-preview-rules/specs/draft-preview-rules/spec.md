## ADDED Requirements
### Requirement: Preview uses the production task rules
The draft preview SHALL reuse production UI and shared configuration and completion rules without real side effects.
#### Scenario: Soft-policy task assigned to someone else
- **WHEN** a soft-policy task is assigned to a simulated roommate
- **THEN** its preview can_complete SHALL be false, matching the real backend
#### Scenario: Hard task before its execution time
- **WHEN** a hard-policy task has not reached its execution time
- **THEN** the preview SHALL reject completion just as the backend does
#### Scenario: Consistent completion samples
- **WHEN** a simulated round member is shown as completed
- **THEN** its task, round total and calendar sample SHALL describe the same completion
#### Scenario: Legacy rules and isolation
- **WHEN** shared functions are used by production or preview
- **THEN** legacy permissions SHALL remain unchanged and preview SHALL perform no API or database writes
