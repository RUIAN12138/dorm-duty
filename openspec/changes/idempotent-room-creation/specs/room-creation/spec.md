## ADDED Requirements
### Requirement: Retry safe room creation
Authenticated schema-v2 creation SHALL bind a random request identifier to the account and normalized request content atomically.
#### Scenario: Repeated or concurrent retry
- **WHEN** an authenticated user repeats the same request after a lost response
- **THEN** the same room is returned with a newly issued authorized session and no duplicate room is created.
#### Scenario: Changed content or revoked identity
- **WHEN** a request identifier is reused with different content or without a valid authorized creator identity
- **THEN** the request is rejected without creating or exposing a room.
