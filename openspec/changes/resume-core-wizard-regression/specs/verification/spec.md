## ADDED Requirements
### Requirement: Wizard browser regression follows real creation flow
The browser verification SHALL exercise current task controls and authenticated creation with isolated data.
#### Scenario: Configure and create
- **WHEN** the test adds and edits a task and completes the wizard
- **THEN** it verifies the saved draft, actual controls and server-confirmed creation without using production data.
