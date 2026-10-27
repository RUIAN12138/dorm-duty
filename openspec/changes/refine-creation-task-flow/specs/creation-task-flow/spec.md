## ADDED Requirements
### Requirement: Creation task selection and editing remain compact and continuous
The new creation wizard SHALL separate template selection from task editing and keep multi-task controls in a single horizontal row.
#### Scenario: Select templates
- **WHEN** a template is pressed
- **THEN** its enabled state SHALL change without unexpectedly opening the editor and a dedicated editing action SHALL remain available when tasks are enabled
#### Scenario: Edit many tasks
- **WHEN** up to twenty tasks are configured and the user selects a task
- **THEN** the current task SHALL remain visible in a single-row rail and editing SHALL preserve all other task values and stable identifiers
#### Scenario: Switch a subpanel
- **WHEN** the user rapidly enters, leaves or changes an editing panel
- **THEN** content SHALL transition without an empty frame, outgoing controls SHALL be inert and the footer SHALL remain visible
#### Scenario: Small viewport and compatibility
- **WHEN** the wizard runs on a normal phone, reduced motion or narrow viewport
- **THEN** core controls SHALL remain available without clipping and existing workspace and live room behavior SHALL remain unchanged
