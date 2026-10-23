## ADDED Requirements
### Requirement: Scoped optical material
The application SHALL enhance only bottom navigation, chat composer, reminder banner and scrub calendar segments, keeping text sharp and layout and gesture ownership unchanged.
#### Scenario: Press and drag
- **WHEN** a user holds or drags a target
- **THEN** its existing motion controller remains the sole transform owner and the optical edge responds without blocking input.
### Requirement: Capability and preference fallback
The system MUST retain usable clear or solid surfaces when advanced refraction fails or reduced transparency is requested.
#### Scenario: Unsupported filter
- **WHEN** backdrop refraction cannot be demonstrated or the graphics context is lost
- **THEN** labels remain visible and a CSS fallback is shown without continuous animation.
### Requirement: Stable keyboard geometry
The composer SHALL retain its viewport position, dimensions and IME handling under optical enhancement.
#### Scenario: Keyboard changes height
- **WHEN** the visual viewport changes while typing
- **THEN** optics do not add a second layout driver or detach the composer from its existing keyboard state.
### Requirement: Truthful evidence and review authorization
The implementation MUST record before/after screenshots and measured browser timing separately from physical-device acceptance.
#### Scenario: PR and deploy for review
- **WHEN** isolated regressions pass for the final digest
- **THEN** the user's explicit final PR and website instruction may authorize those actions for that digest while acceptance remains pending and main is not merged.
