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
#### Scenario: Local development access
- **WHEN** the user opens the local app at localhost or a loopback address
- **THEN** an explicit new-room wizard experience action is available and opens an isolated draft without requiring email entry
#### Scenario: Local experience completion
- **WHEN** the user completes the local wizard experience
- **THEN** the app confirms locally without creating a room or issuing a room-creation request

### Requirement: Natural task pacing and time wheel
The new-room rules page MUST use understandable labels for supported modes and show wheel controls only where time settings apply.
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
#### Scenario: Existing-room settings
- **WHEN** a user configures an existing room
- **THEN** its existing settings progress control and flow remain unchanged

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
