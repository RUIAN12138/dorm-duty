## ADDED Requirements
### Requirement: Subtle creation step affordance
Creation progress SHALL indicate five step positions using small internal marks without large circular nodes or numeric labels.
#### Scenario: Direct drag
- **WHEN** a user drags across the track
- **THEN** existing step snapping, tips and transient thumb SHALL remain synchronized
### Requirement: Production-equivalent preview
The preview SHALL use production page components and the same layout mode and safe-area spacing with an isolated data source.
#### Scenario: Scroll and navigate
- **WHEN** preview pages scroll, navigate or open task details
- **THEN** layout and interaction SHALL match production without business writes or notifications
### Requirement: Second-page task selection
Multiple enabled tasks on the second page SHALL use the production duty task selector and render one selected task at a time.
#### Scenario: Switch and return
- **WHEN** selecting or swiping between tasks and returning to the page
- **THEN** task details, action permissions and selection SHALL correspond to the stable task key without any switch-triggered writes
#### Scenario: One task and legacy rooms
- **WHEN** only one task exists or a room has no dynamic configuration
- **THEN** no unnecessary selector SHALL appear and legacy behavior SHALL remain unchanged
