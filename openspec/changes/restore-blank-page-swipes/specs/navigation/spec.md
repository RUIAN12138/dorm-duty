## ADDED Requirements
### Requirement: Blank area navigates adjacent pages
Signed-in pages SHALL allow horizontal navigation from blank areas while respecting independent component gestures.
#### Scenario: Horizontal swipe
- **WHEN** the user swipes left or right in an eligible blank area
- **THEN** the adjacent page and navigation selection update together without sending a task action.
#### Scenario: Independent gesture or modal
- **WHEN** a gesture begins on a task control, calendar, sheet, input or other independent gesture area
- **THEN** global navigation does not take ownership.
