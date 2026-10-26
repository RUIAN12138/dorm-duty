## ADDED Requirements
### Requirement: Continuous reply and exact read intent
The banner SHALL preserve its mounted card during reply, protect the triggering touch and sync reads by exact message id.
#### Scenario: Hold and release
- **WHEN** a user holds for 400ms and releases with small drift
- **THEN** reply stays open and synthetic click does not dismiss it
#### Scenario: Explicit close
- **WHEN** the user selects close message
- **THEN** the existing persistent read queue records that id only
#### Scenario: Cancel
- **WHEN** reply is cancelled or times out
- **THEN** no read intent is generated
#### Scenario: Compact viewport
- **WHEN** keyboard or orientation reduces visible height
- **THEN** editor/actions remain reachable and glass clipping does not cut their borders
### Requirement: Isolated deployment
A test build SHALL use synthetic data and cannot access production APIs; regular builds SHALL omit all test controls.
#### Scenario: Sites review
- **WHEN** preview is published
- **THEN** it is labelled test version with separate state and unchanged site audience
