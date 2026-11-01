# Spec Delta

## MODIFIED Requirements

### Requirement: Wayland backend selection
The app SHALL activate the Wayland overlay backend when it starts on a Wayland session with an available KWin compositor, and the X11 backend otherwise, including Wayland sessions without KWin. Selection SHALL be overridable with the `--overlay-backend=x11|wayland` command-line flag. The Wayland backend SHALL own game window tracking, overlay placement, and host input integration for that session.

#### Scenario: Wayland session
- **WHEN** the app starts in a Wayland session with an available KWin compositor
- **THEN** game window tracking and overlay placement are driven by the compositor integration rather than by X11 APIs

#### Scenario: X11 session
- **WHEN** the app starts in an X11 session
- **THEN** the X11 backend is used and its behavior is unchanged

#### Scenario: Wayland session without KWin
- **WHEN** the app starts in a Wayland session without an available KWin compositor (for example GNOME)
- **THEN** the X11 backend is used under XWayland and no KWin integration is attempted

#### Scenario: Backend override flag
- **WHEN** the app is launched with `--overlay-backend=x11` or `--overlay-backend=wayland`
- **THEN** the requested backend is selected regardless of the detected session
