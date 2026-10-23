## ADDED Requirements
### Requirement: Stable single-row suggestions
Suggestions MUST remain one fixed-height horizontal row, with the note action first and sampled existing questions stable for one entry.
#### Scenario: Enter again
- **WHEN** a new chat entry begins
- **THEN** 2 or 3 existing questions are sampled for the width, avoiding the previous ordered combination when possible, and note remains first
#### Scenario: Touch and overflow
- **WHEN** questions exceed the row width or the user is pressing a question
- **THEN** native horizontal scrolling works without a visible scrollbar and questions do not change or wrap during the interaction
### Requirement: Lossless grapheme-safe assistant bubbles
Assistant presentation MUST contain no more than 20 user-visible graphemes per bubble without changing the source or persisted messages.
#### Scenario: Long answer
- **WHEN** an assistant reply exceeds the limit
- **THEN** sentence boundaries, pauses and phrase boundaries are preferred before a grapheme-safe fallback; concatenation preserves every original character exactly
#### Scenario: Unicode and user input
- **WHEN** text contains emoji, combining characters or long user input
- **THEN** assistant clusters are not split across bubbles or reveal spans, and user messages stay intact
### Requirement: Coordinated reply presentation
New assistant parts MUST appear progressively using existing bubble motion and pinned scrolling without replaying history or business actions.
#### Scenario: New response and history reader
- **WHEN** fresh reply parts arrive while a user reads older messages
- **THEN** parts appear in deterministic source order without stealing scroll position or repeating reminder/note actions
#### Scenario: Reopen and clear
- **WHEN** history reloads, chat closes, identity changes or history clears
- **THEN** cached parts render immediately and consistently, pending old reveal callbacks cannot resurrect cleared or another member's messages, and reduced-motion renders final state directly
