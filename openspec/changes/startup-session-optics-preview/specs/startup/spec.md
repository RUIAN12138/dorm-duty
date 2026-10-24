## ADDED Requirements
### Requirement: Verified startup
The application SHALL hide login UI until restoration settles and MUST preserve credentials on temporary failure.
#### Scenario: Offline restoration
- **WHEN** verification fails due to network
- **THEN** show recovery with retry, without deleting credentials
### Requirement: Isolated scope
The experiment MUST stay local with no production deployment.
#### Scenario: WebGL unavailable
- **WHEN** WebGL cannot be used
- **THEN** preserve CSS glass and all navigation gestures
