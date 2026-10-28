## ADDED Requirements
### Requirement: Optional disabled task
A disabled optional schema-v2 task SHALL be permitted to have an empty name while preserving its stable identifier.
#### Scenario: Create with an unnamed disabled task
- **WHEN** a valid enabled task and an unnamed disabled optional task are submitted
- **THEN** creation succeeds and the optional task remains disabled.
#### Scenario: Enable unnamed task
- **WHEN** the unnamed task is enabled without adding a name
- **THEN** validation rejects the configuration without mutating existing data.
