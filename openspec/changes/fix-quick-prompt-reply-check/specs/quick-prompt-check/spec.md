## ADDED Requirements
### Requirement: Verify the appropriate quick-prompt response
The isolated browser check SHALL validate the authenticated fact response for a task question and the mock model response for a usage question.
#### Scenario: Random preset selection
- **WHEN** either supported preset is selected
- **THEN** the check SHALL await its correct response and retain the existing single-user-message verification
