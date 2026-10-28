## ADDED Requirements
### Requirement: Preview note cooldown matches live behavior
The preview SHALL match the live per-recipient note cooldown without contacting real services.
#### Scenario: Repeat a note
- **WHEN** a user sends another preview note to the same simulated member within 15 seconds
- **THEN** the preview refuses it, and accepts it once 15 seconds has elapsed.
