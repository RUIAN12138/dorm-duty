## ADDED Requirements
### Requirement: Preserve checks within a bounded Web CI budget
The Web CI job SHALL retain every existing test and use a 25-minute total timeout.
#### Scenario: Complete under the adjusted budget
- **WHEN** browser installation and all existing checks finish within 25 minutes
- **THEN** the exact code SHA SHALL receive its actual success or assertion-failure result without removing checks
#### Scenario: Timeout or failure
- **WHEN** the job exceeds the budget or a check fails
- **THEN** deployment SHALL remain blocked and the failure SHALL be reported truthfully
