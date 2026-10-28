## ADDED Requirements
### Requirement: Nudge gesture isolation
The nudge title SHALL own vertical gestures without scrolling the page, while other areas retain native scroll.
#### Scenario: Only one pending person
- **WHEN** the user swipes vertically with one pending assignee
- **THEN** the companion explains that only this person remains.
#### Scenario: Reminder failure
- **WHEN** reminder delivery fails
- **THEN** the companion shows an actionable non-modal tip.
