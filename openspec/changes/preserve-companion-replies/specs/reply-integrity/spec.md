## ADDED Requirements
### Requirement: Preserve assistant replies before presentation
The service SHALL preserve all valid reply strings through storage and replay, subject to existing action safety checks and provider response limits.
#### Scenario: Long reply and composite emoji
- **WHEN** the simulated provider returns long text or composite emoji within valid reply strings
- **THEN** the service stores and replays the complete strings without splitting or silently truncating them.
#### Scenario: Reminder safety
- **WHEN** the simulated provider proposes a reminder
- **THEN** existing confirmation and authorization checks remain in force.
