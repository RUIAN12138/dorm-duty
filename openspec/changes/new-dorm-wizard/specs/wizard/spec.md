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
#### Scenario: Short or landscape guide viewport
- **WHEN** the welcome guide is shown in a short or landscape viewport
- **THEN** its header and bottom actions remain visible, and each page can scroll vertically so the companion, title, and guidance text are reachable without clipping
- **AND** vertical scrolling within a page does not change the selected horizontal page
- **AND** in landscape, the companion's reserved gap is compact and the skip action has the same subtle press response as the primary action

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
#### Scenario: Hide irrelevant task selector outside scheduled mode
- **WHEN** the user views or selects a non-time-based unified pacing mode
- **THEN** the task selector used only to edit scheduled times is hidden
- **AND** selecting scheduled mode reveals it when multiple tasks have independent times
- **AND** switching away from scheduled mode preserves each task's saved time and selection state
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

### Requirement: Minimal room-name step
The first new-room step MUST focus on the room-name question and one accessible text input. The rule that roommates enter their own names when joining MUST be communicated without duplicating the field label and a separate helper paragraph.
#### Scenario: Room-name step content
- **WHEN** a user opens the first new-room step
- **THEN** the page shows the room-name question, one text input with the accessible name “宿舍名称”, and a concise companion tip explaining that roommates enter their own names after joining
- **AND** it does not show a second visible field label or helper paragraph repeating the join-name rule
- **AND** the existing required-name validation, input length limit, and draft persistence remain unchanged

### Requirement: Validation feedback tracks the current draft
After a validation attempt, the wizard MUST keep local validation feedback synchronized with the current step's draft values.
#### Scenario: Correct a field-level error
- **WHEN** the user receives a required-field error and edits the field into a valid value
- **THEN** the resolved error disappears without requiring another press of the primary action
#### Scenario: Keep an invalid value visible
- **WHEN** the user edits a required field but its value still fails validation
- **THEN** the validation error remains visible
- **AND** validation rules, saved values, and submission behavior remain unchanged

### Requirement: Concise pacing-step tip
The new-room pacing step MUST keep the companion tip distinct from the page question and preserve only useful supporting context.
#### Scenario: Pacing tip avoids repeating the question
- **WHEN** a user sees the pacing-step title and the three choices
- **THEN** the companion tip says only that the choice can be changed later
- **AND** it does not repeat the instruction to choose a suitable pacing mode
- **AND** the available choices, configuration values, and page layout remain unchanged

### Requirement: Creation progress resize listener lifecycle
The creation progress control MUST keep its responsive measurement fallback when `ResizeObserver` is unavailable and MUST release the fallback listener when unmounted.
#### Scenario: Resize fallback is removed on exit
- **WHEN** a browser without `ResizeObserver` opens and then leaves the creation wizard
- **THEN** the progress control responds to window resize while mounted
- **AND** the listener registered by that control is removed on unmount
- **AND** progress dragging remains usable after a cancelled or reversed gesture

### Requirement: Welcome guide copy avoids title repetition
Each welcome-guide page MUST use its body to add useful context or an action without restating the page title.
#### Scenario: Tutorial copy stays concise
- **WHEN** a user reads the first or calendar tutorial page
- **THEN** the first page tells the user that today's tasks and assignee appear on Home without repeating an “open Home” instruction
- **AND** the calendar page keeps its completion-record topic in the title and uses the body only to add that tasks can be adjusted in Settings
- **AND** the tutorial page count, order, navigation, and behavior remain unchanged

### Requirement: Version-2 notification permission preflight is concise
The version-2 room notification settings MUST explain the notification purpose before requesting system permission, and the request MUST remain a direct result of an explicit user action. The explanation and action MUST not require opening a second duplicate settings sheet. Existing permission, subscription, and error-retry behavior MUST remain unchanged.
#### Scenario: User opens version-2 notification settings
- **WHEN** a user opens system-notification settings in a version-2 room
- **THEN** the notification purpose and enable action are visible in the same settings sheet
- **AND** opening the sheet alone does not request system permission
- **AND** clicking the enable action requests permission once
#### Scenario: User denies permission
- **WHEN** the user denies or the permission request fails
- **THEN** the existing error remains visible and the user can retry or leave without a false success state
