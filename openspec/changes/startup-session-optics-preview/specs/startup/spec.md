## ADDED Requirements
### Requirement: Verified startup
The application SHALL hide login UI until restoration settles and MUST preserve credentials on temporary failure.
#### Scenario: Offline restoration
- **WHEN** verification fails due to network
- **THEN** show recovery with retry, without deleting credentials
### Requirement: Durable session token wins over restored tab state
The application MUST use the durable browser session token as the canonical bearer credential when it conflicts with a restored `sessionStorage` snapshot. An unauthorized response for an older token MUST NOT clear or invalidate a newer current session.
#### Scenario: A stale tab snapshot is restored
- **WHEN** `sessionStorage` contains an older token than the persisted session token
- **THEN** session restoration and API requests use the persisted token and refresh the tab copy
#### Scenario: A delayed unauthorized response arrives after a new login
- **WHEN** an API request made with an old token returns unauthorized after a replacement token has been persisted
- **THEN** the replacement token remains stored and the current session is not marked expired
### Requirement: A live email session survives service-process restart
The email authentication service MUST restore an unexpired HttpOnly session cookie and its bound dorm identities after an application-server runtime restart. Restart recovery MUST use the existing persisted session and configured expiry; it MUST NOT mint a new email session or extend its lifetime.
#### Scenario: Restart with an unexpired email cookie
- **WHEN** the service runtime is recreated while the browser still holds a valid email cookie
- **THEN** `/email/me` returns the same verified account and previously bound dorm identities
- **AND** the existing member bearer remains valid until its original server-side expiry
#### Scenario: Expired email cookie
- **WHEN** the server-side email session has expired or has been revoked
- **THEN** `/email/me` does not restore the account from a cached member bearer alone
### Requirement: Isolated scope
The experiment MUST stay local with no production deployment.
#### Scenario: WebGL unavailable
- **WHEN** WebGL cannot be used
- **THEN** preserve CSS glass and all navigation gestures
