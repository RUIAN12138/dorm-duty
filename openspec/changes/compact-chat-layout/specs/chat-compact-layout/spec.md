## ADDED Requirements
### Requirement: One coordinated keyboard layout
The chat MUST use a single visual viewport state for root bounds, composer attachment, compact header and scroll anchoring without timer-based keyboard compensation.
#### Scenario: Keyboard opens and reverses
- **WHEN** visual viewport height decreases, changes offset or restores while focused or after early blur
- **THEN** the root and composer follow that viewport in the same layout frame, and no independent smooth scroll or second keyboard offset is started
#### Scenario: Compact header
- **WHEN** keyboard occlusion grows
- **THEN** the ball progressively shrinks to 65–75 percent, its nameplate follows, the back control fades and message space increases without resizing message text
#### Scenario: Historical reading
- **WHEN** a reader above the bottom opens/closes keyboard or changes note panel
- **THEN** the visible message anchor remains stable and entry scrolling is not rerun

### Requirement: Shared reversible note and composer layout
The chat MUST coordinate note workflow, suggestions and composer in one stable layout container.
#### Scenario: Note workflow changes repeatedly
- **WHEN** recipient/content/confirmation/cancel states change with or without keyboard
- **THEN** the panel continuously expands/reverses without resetting the chat, preserves business confirmation and duplicate-send guards, and leaves the input reachable

### Requirement: Quick prompts on each entry
The chat MUST show existing quick prompts on every entry with the note action first.
#### Scenario: Cached conversation reopens
- **WHEN** chat opens with cached history
- **THEN** expanded quick prompts begin with “我要留言” followed by the original prompt order without replaying history animations
#### Scenario: Note shortcut
- **WHEN** the user selects “我要留言”
- **THEN** the existing note state machine starts without an AI request or unconfirmed send
#### Scenario: Keyboard space
- **WHEN** keyboard opens and closes
- **THEN** suggestions collapse naturally and restore only when interaction state permits, without repeated entrance resets
