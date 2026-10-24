## ADDED Requirements
### Requirement: New-room isolation
The system MUST store version-2 configuration only for explicitly new rooms and preserve legacy rooms.
#### Scenario: Existing room
- **WHEN** no version-2 configuration exists
- **THEN** legacy task/navigation/entry behavior remains
### Requirement: Draft preview
The wizard SHALL use one draft and MUST NOT write task records or issue business API requests during preview. The full-screen preview MUST mount the application's production task board, calendar and bottom navigation components instead of a separate preview-only page implementation.
#### Scenario: Navigation reorder
- **WHEN** the user drags a navigation item
- **THEN** preview order and selected content update together
#### Scenario: Live production-component preview
- **WHEN** the user opens the draft preview
- **THEN** the wizard leaves the visible viewport and production page components render full-screen using only synthetic draft data
#### Scenario: Preview isolation
- **WHEN** the user completes, undoes, nudges, opens calendar statistics, or changes preview navigation
- **THEN** no task, reminder, account, push, or room API request is issued

### Requirement: Welcome tutorial and local flow access
The product MUST expose a standalone four-page welcome guide and local loopback builds MUST provide a visible, isolated route into the new-room wizard, including production-mode bundles served locally.
#### Scenario: Tutorial route
- **WHEN** the user opens `/guide`
- **THEN** four swipeable pages are shown and the last page can start the app
#### Scenario: Actionable tutorial copy
- **WHEN** a user reads a welcome-guide page
- **THEN** its short description names the relevant action or entry point, including tapping the companion to leave a message and returning to Home to open Messages and read replies
#### Scenario: Local development access
- **WHEN** the user opens the local app at localhost or a loopback address
- **THEN** an explicit new-room wizard experience action is available and opens an isolated draft without requiring email entry
#### Scenario: Local experience completion
- **WHEN** the user completes the local wizard experience
- **THEN** the app confirms locally without creating a room or issuing a room-creation request
#### Scenario: Jump between standalone guide pages
- **WHEN** the user selects a distant page using the page indicator
- **THEN** the active page content and primary action stay synchronized with the page nearest the visible scroll position, then settle on the selected page
- **AND** the indicator touch targets keep fixed layout positions while the active capsule stretches visually

### Requirement: Natural task pacing and time wheel
The new-room rules page MUST use understandable labels for supported modes and show wheel controls only where time settings apply.
#### Scenario: Explain pacing choices
- **WHEN** a user sees the three new-room pacing choices
- **THEN** each choice includes one concise explanation of when the next round or assignee changes, and all three remain visible without vertical scrolling at 390×844 CSS pixels
#### Scenario: Scheduled task selection
- **WHEN** the user chooses a time-scheduled task
- **THEN** its hour/minute wheel is available and updates the draft value
#### Scenario: Round mode selection
- **WHEN** the user switches a task to completion-round mode
- **THEN** time-only controls disappear without erasing the retained draft time
### Requirement: Five-stage creation progress
New-room creation MUST expose no more than five top-level pages: room name, tasks, page arrangement, rules, and preview/confirmation. Task-specific values remain inside their matching topic page.
#### Scenario: New-room progress display
- **WHEN** a user creates a new room
- **THEN** the progress control shows a 9px black-and-white track, a 32–36px glass thumb with a 44px+ touch target, no visible step numbers or dense tick marks, and five or fewer accessible destinations
#### Scenario: Dragging between creation stages
- **WHEN** the user drags the glass thumb across a valid stage boundary
- **THEN** the content, page title, and companion tip update during the drag, and release settles the thumb to the nearest stage
- **AND** the final pointer-up position is applied even if the platform coalesces or omits the last pointer-move event
#### Scenario: Existing-room settings
- **WHEN** a user configures an existing room
- **THEN** its existing settings progress control and flow remain unchanged

### Requirement: Start creation at the first actionable question
Opening the new-room creation flow MUST show the first editable room-name step directly instead of an additional creation-only introduction. The standalone `/guide`, the once-per-member guide for first entry into a version-2 room, and manual workspace help MUST remain available.
#### Scenario: First-time creation entry
- **WHEN** a user starts creating a new room with no saved draft
- **THEN** the room-name field and creation progress are immediately visible
- **AND** no creation-only welcome slides or automatic spotlight block the first edit
#### Scenario: Standalone onboarding remains
- **WHEN** a user opens `/guide` or enters a version-2 room for the first time
- **THEN** the existing four-page welcome guide or the existing first-entry guide behavior remains unchanged

### Requirement: Single-screen new-room page arrangement
The new-room page-arrangement step MUST fit the title, both page destinations, enabled task names, second-page type, and wizard actions within a normal phone viewport without reducing the established large type. This compact presentation MUST NOT alter the existing-room settings workspace.

#### Scenario: Normal phone viewport
- **WHEN** page arrangement is shown at 390×844 CSS pixels with default text size
- **THEN** duty and second-page task groups render side by side, each enabled task is named once, the footer actions remain visible, and the wizard body has no required vertical scroll

#### Scenario: Narrow and accessible viewport
- **WHEN** page arrangement is shown at 320px width or a short/zoomed viewport
- **THEN** both columns remain free of horizontal overflow; if all content cannot fit vertically, the page permits safe scrolling without clipping a task or the footer controls

#### Scenario: Move a task by tap or drag
- **WHEN** a user taps a task name or long-presses and drags it to the other page group
- **THEN** the same draft assignment changes, the destination responds, and layout changes animate smoothly; the duty group never accepts more than four enabled tasks

#### Scenario: Change second-page type
- **WHEN** a user selects task page or nudge page inside the second-page group
- **THEN** the draft preview reflects that selection immediately without writing formal task records

#### Scenario: Existing-room settings
- **WHEN** a user opens task settings for an already-created room
- **THEN** the current workspace page arrangement layout and controls remain unchanged

### Requirement: Version-2 task pacing reflects real execution
The new-room wizard MUST expose the three supported pacing choices with understandable labels and persist each choice as the matching runtime mode. The completion handoff mode MUST be enabled only by an explicit version-2 room configuration; legacy room settings and behavior MUST remain unchanged.
#### Scenario: All members complete before the next round
- **WHEN** a version-2 task uses “大家做完再开始下一轮”
- **THEN** it persists as `self_round` and the next round is created only after every active member completes the current round
#### Scenario: Scheduled task
- **WHEN** a version-2 task uses “按时间安排”
- **THEN** it persists as `scheduled` and its time wheel is visible in the current rules step with execution/deadline semantics that can be validated
#### Scenario: Completion handoff task
- **WHEN** a version-2 task uses “做完交给下一位”
- **THEN** it persists as `completion`, has at most one active assignee, and successful completion advances once to the next active member in configured order
#### Scenario: Legacy room mode safety
- **WHEN** an existing room without a version-2 configuration is edited through its legacy settings path
- **THEN** non-water tasks cannot be switched to the new completion mode and their current tasks, order, and history remain intact

### Requirement: First-use guide follows version-2 room entry
After successful creation or first join of a version-2 room, the standalone welcome guide MUST be offered once per member and room, with a safe return to the originating room/page. Completion and skip both suppress automatic replay, while manual replay returns to its caller. Legacy rooms MUST NOT be automatically redirected.
#### Scenario: First version-2 room entry
- **WHEN** a member reaches a version-2 room for the first time
- **THEN** the standalone guide opens once after room data is ready and can be skipped without blocking normal use
#### Scenario: Guide return
- **WHEN** a member finishes, skips, or manually reopens the guide
- **THEN** the app returns to the originating in-room page and preserves that room context
#### Scenario: Legacy room entry
- **WHEN** a member enters a room without version-2 configuration
- **THEN** the guide does not automatically open

### Requirement: Preview side effects are isolated at action boundaries
The production-component preview MUST use synthetic draft data and reject every business side effect at the action/service boundary, including completion, undo, nudges, reminder reads, push actions, account actions, and room/settings writes.
#### Scenario: Preview attempts a business action
- **WHEN** a preview user triggers an action that would normally mutate a task, reminder, push subscription, account, room, or settings
- **THEN** no business API request or persistent application state change occurs
#### Scenario: Preview requests display-only content
- **WHEN** a preview user opens locally renderable calendar, statistics, task details, or display-only help
- **THEN** it renders from synthetic data without a business API request
