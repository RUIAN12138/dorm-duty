## ADDED Requirements
### Requirement: Scoped touch feedback
Existing selected card surfaces SHALL provide at most 2 degree contact tilt, 1–2px depression and 0.985–0.995 scale without changing geometry, text, actions or business semantics.
#### Scenario: Press and release
- **WHEN** a primary pointer presses and moves slightly on a selected card
- **THEN** contact feedback follows with cached geometry, and release settles continuously without overwriting existing transform
#### Scenario: Gesture takeover
- **WHEN** horizontal or vertical movement exceeds the existing intent threshold, capture is cancelled or an ancestor scrolls
- **THEN** feedback releases and original swipe/scroll/selection behavior remains authoritative
### Requirement: Existing drag lift
Member cards SHALL lift only when the existing long-press controller marks the row held, without adding another drag recognizer or changing order rules.
#### Scenario: Hold and drop
- **WHEN** existing held state starts and ends
- **THEN** the inner card rises 3–5px with local shadow and settles back while Reorder retains its translation and scale
### Requirement: Lifecycle and isolation
Feedback SHALL not override another transform owner, disabled state, reduced motion or keyboard navigation.
#### Scenario: Reduce or deactivate
- **WHEN** reduced motion, keyboard interaction, page hiding, blur or unmount occurs
- **THEN** transient motion ends, owned styles/listeners are restored, and no production or unrelated UI is changed
