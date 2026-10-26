## ADDED Requirements
### Requirement: Inset stop affordances
Creation progress SHALL show five small rounded internal marks inside the existing thick track, without large circle nodes, digits, labels or layout changes.
#### Scenario: Step changes
- **WHEN** the active creation page changes
- **THEN** its internal mark SHALL update together with the selected page while other controls retain their geometry
### Requirement: Interruptible magnetic drag
Only creation mode SHALL gently attract the thumb near step centers and reveal or hide it with continuous transform and opacity.
#### Scenario: Drag and reverse
- **WHEN** the pointer crosses steps or reverses before release
- **THEN** pages SHALL update before release, haptics SHALL fire only on changed steps, and the thumb SHALL continue from its current visual state
#### Scenario: Cancel and reduced motion
- **WHEN** a gesture cancels or the system requests reduced motion
- **THEN** the control SHALL leave no visible residue and remain keyboard accessible without modifying the settings workspace behavior
