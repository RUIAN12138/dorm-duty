## ADDED Requirements
### Requirement: Continuous in-place quick reply
The banner MUST enter inline reply after a 350–450ms hold using the same message element, preserve its glass style, and avoid navigating to chat.
#### Scenario: Valid sender long press
- **WHEN** a still pointer is held for 400ms on a member message
- **THEN** the same banner expands, focuses the editor, shows a frosted backdrop and binds its actual sender
#### Scenario: System message or gesture interruption
- **WHEN** sender is scheduled, missing, self or no longer a roommate, or the pointer moves before hold completes
- **THEN** no arbitrary reply target or message send/read is created, and ordinary swipe/click rules remain available

### Requirement: Confirmed send and immutable message identity
Quick reply MUST reuse the existing notes endpoint and original identity/message snapshot, lock duplicate sends and retain failed drafts.
#### Scenario: Success
- **WHEN** the existing API confirms delivery
- **THEN** the panel closes and only the original incoming message is submitted for server read acknowledgement
#### Scenario: Failure and late response
- **WHEN** send fails or identity/message changes before response
- **THEN** failed draft remains for retry while original message stays unread, and a stale response cannot close or read a different message

### Requirement: Explicit read policy with retry
Read status MUST be server-confirmed and retryable per identity; presentation alone is not reading.
#### Scenario: Manual swipe
- **WHEN** an upward gesture crosses the close threshold
- **THEN** the banner exits continuously and submits its captured message ID for read acknowledgement
#### Scenario: Timeout or cancellation
- **WHEN** the banner times out, a short swipe springs back, or backdrop/escape cancels reply
- **THEN** no read request is created
#### Scenario: Receipt fails
- **WHEN** server read acknowledgement fails or another board operation is busy
- **THEN** a pending receipt remains retryable without changing read_at locally until success, and other-device reads are reflected through existing board polling

### Requirement: Shared keyboard and background layout
The inline editor MUST follow the real visual viewport above the keyboard, lock background scroll and preserve the original page position.
#### Scenario: Keyboard and viewport changes
- **WHEN** the keyboard, candidate bar or device orientation changes
- **THEN** one coalesced viewport state drives the reply panel, input remains reachable, and no independent keyboard offset or scrollIntoView is added
#### Scenario: Close and accessibility
- **WHEN** reply closes, reverses mid-animation, or reduced motion is active
- **THEN** the same card settles without remounting the page, background styles/position restore and functions remain usable
