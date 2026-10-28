## ADDED Requirements
### Requirement: Optional disabled task
A disabled optional schema-v2 task SHALL be permitted to have an empty name while preserving its stable identifier.
#### Scenario: Create with an unnamed disabled task
- **WHEN** a valid enabled task and an unnamed disabled optional task are submitted
- **THEN** creation succeeds and the optional task remains disabled.
#### Scenario: Enable unnamed task
- **WHEN** the unnamed task is enabled without adding a name
- **THEN** validation rejects the configuration without mutating existing data.

#### Scenario: Disabled task retains time settings
- **WHEN** a disabled optional task has valid time formats but an execution time not earlier than its deadline
- **THEN** creation succeeds and preserves the settings; enabling the task without correcting the order is rejected.
