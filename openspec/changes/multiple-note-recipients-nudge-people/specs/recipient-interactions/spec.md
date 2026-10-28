## ADDED Requirements
### Requirement: Multiple note recipients
Users SHALL select one or more roommates and explicitly confirm a single atomic note delivery.
#### Scenario: Selected roommates
- **WHEN** selected valid roommates receive a confirmed note
- **THEN** all receive separate read states, or none receive it on failure
- **AND** room isolation, sender exclusion and cooldown remain enforced.
#### Scenario: Failed delivery
- **WHEN** validation or delivery fails
- **THEN** the draft and selected recipients remain available and no recipients receive a partial write.
### Requirement: Nudge recipient navigation
Users SHALL change the current task's pending responsible roommate by swiping vertically on the large title.
#### Scenario: Gesture direction
- **WHEN** the user swipes horizontally, vertically or cancels
- **THEN** horizontal selects tasks, vertical selects eligible people, and cancellation never sends a notification.
- **AND** other page scrolling and the existing per-task cooldown remain intact.
