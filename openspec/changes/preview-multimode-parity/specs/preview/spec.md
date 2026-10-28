## ADDED Requirements
### Requirement: Preview parity across assignment modes
The preview sandbox SHALL match the real service's task status, assignment, completion, undo and permission outcomes for its synthetic data.
#### Scenario: One and two members
- **WHEN** self-round, scheduled, handoff and water tasks are exercised using isolated test members
- **THEN** the sandbox and backend agree on current assignments, completion, undo and denial of unauthorized completion.
