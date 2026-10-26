## ADDED Requirements
### Requirement: Creation fits available screen
The new creation wizard SHALL display core content and footer on a normal mobile viewport without vertical searching, using in-step task pagination and mutually exclusive editing panels.
#### Scenario: Many tasks
- **WHEN** more than four tasks are available in a group
- **THEN** paging SHALL expose every task without changing its ID or configuration and without a long vertical list
#### Scenario: Small accessible screen
- **WHEN** viewport height or large text cannot safely fit content
- **THEN** necessary scrolling SHALL remain available without hiding required actions
### Requirement: Creation progress is directly manipulable
The creation track SHALL be thick with white circular nodes equal to track thickness and an interruptible transient glass thumb.
#### Scenario: Drag track
- **WHEN** a pointer presses any point on the track and drags across steps
- **THEN** thumb, page and tips SHALL update together, with at most one haptic attempt per changed step
#### Scenario: Release or cancel
- **WHEN** gesture finishes or is cancelled
- **THEN** thumb SHALL settle and shrink away continuously without residual capture or duplicate click
#### Scenario: Workspace isolation
- **WHEN** progress is used in existing task settings
- **THEN** original workspace appearance and accessible variable steps SHALL remain available
