# Spec Delta

## Purpose

Consumes overlay windowing in the app through the drop-in npm package `electron-overlay-window-next`, which provides the `electron-overlay-window` controller API with automatic overlay backend selection and configurable app identifiers (main process, `main/src/windowing/`).

## ADDED Requirements

### Requirement: Single overlay windowing dependency
The app SHALL obtain overlay controller functionality — attachment to the game window, activation and focus switching, game window bounds, tracking events, and overlay window options — through the drop-in package `electron-overlay-window-next`, which SHALL expose the same API surface as `electron-overlay-window`, and the app SHALL NOT depend on `electron-overlay-window` directly.

#### Scenario: API parity after the swap
- **WHEN** the app uses only the package's controller API on any platform
- **THEN** overlay attachment, activation, focus switching, and game-bounds behavior match the behavior before the extraction

#### Scenario: No direct original dependency
- **WHEN** the app's main process dependencies are inspected
- **THEN** `electron-overlay-window` appears only as a transitive dependency of the package, not as a direct app dependency

### Requirement: Automatic backend selection without app code
The package SHALL select the overlay backend automatically from the host session: the KWin compositor backend on supported Wayland sessions and the `electron-overlay-window` implementation on Windows, macOS, and X11 sessions, without backend-selection branches in the app's windowing modules.

#### Scenario: Delegated platforms
- **WHEN** the app starts on Windows, macOS, or an X11 session
- **THEN** the package delegates game window tracking and overlay attachment to the original `electron-overlay-window` implementation with unchanged behavior

#### Scenario: KDE Wayland without branches
- **WHEN** the app starts on a supported KDE Wayland session
- **THEN** the package drives attachment, activation, and focus through its KWin backend without any backend-selection code in the app's windowing modules

### Requirement: Configurable app identity
The package SHALL accept app-specific identifiers as configuration: the overlay window title the compositor integration matches, the DBus service name for the bridge connection, and the overlay window class used by the compositor window rule. The app SHALL pass its own identifiers at initialization.

#### Scenario: App identifiers are honored
- **WHEN** the app initializes the package with its overlay title, DBus service name, and window class
- **THEN** the compositor script matching, DBus service registration, and window rule use exactly those values

#### Scenario: Reuse by another application
- **WHEN** another Electron app adopts the package with its own identifiers
- **THEN** the package behavior contains no Exiled Exchange 2 specific values

### Requirement: Shared session detection
The package SHALL export session detection helpers (the detected backend kind and a Wayland-backend predicate) and the app SHALL use them for all backend-kind decisions, including app-level host-input and clipboard seams, so detection has a single source of truth.

#### Scenario: Consistent detection across seams
- **WHEN** the app's shortcut, injection, or clipboard modules need the backend kind
- **THEN** they obtain it from the package's exported helpers and no app module implements its own session detection
