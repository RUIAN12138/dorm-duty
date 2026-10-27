## ADDED Requirements
### Requirement: Preserve the original water page composition
The nudge page SHALL retain the original water page's caption, hero and action geometry while offering swipe navigation.
#### Scenario: Layout comparison
- **WHEN** the same simulated water task and member are rendered in old and new builds
- **THEN** the caption, large title, actions and navigation SHALL keep their prior position and type scale
### Requirement: Interruptible elastic title and nudge icon
The large title SHALL stretch subtly during displacement and return with a spring, and the nudge navigation SHALL use a reminder icon.
#### Scenario: Drag or discovery
- **WHEN** the title shifts to reveal an adjacent task
- **THEN** intermediate frames SHALL contain small scale deformation and continuous position changes, followed by a neutral final pose
#### Scenario: Cancellation or reduced motion
- **WHEN** the user interrupts, cancels or requests reduced motion
- **THEN** no stale callback SHALL restart a completed cue and reduced motion SHALL omit translation/scale
