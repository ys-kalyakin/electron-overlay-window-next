# overlay-backend-package Specification

## Purpose

Consumes overlay windowing in the app through the drop-in npm package `electron-overlay-window-next`, which provides the `electron-overlay-window` controller API with automatic overlay backend selection and configurable app identifiers (main process, `main/src/windowing/`).

## Requirements

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
The package SHALL accept app-specific identifiers as optional configuration: the overlay window title the compositor integration matches, the DBus service name for the bridge connection, and the overlay window class used by the compositor window rule. When the app provides identifiers at initialization, the package SHALL use exactly those values. When the app does not, the package SHALL derive them under the hood: the overlay window title SHALL be taken from the attached overlay window, and the compositor window rule SHALL match the overlay window by that title instead of a window class.

#### Scenario: App identifiers are honored
- **WHEN** the app initializes the package with its overlay title, DBus service name, and window class
- **THEN** the compositor script matching, DBus service registration, and window rule use exactly those values

#### Scenario: Reuse by another application
- **WHEN** another Electron app adopts the package with its own identifiers
- **THEN** the package behavior contains no Exiled Exchange 2 specific values

#### Scenario: Identifiers derived without explicit initialization
- **WHEN** the app uses only the controller API without passing identifiers to the package
- **THEN** the compositor scripts match the attached overlay window's title and the window rule matches the overlay window by that title

### Requirement: Shared session detection
The package SHALL export session detection helpers (the detected backend kind and a Wayland-backend predicate) and the app SHALL use them for all backend-kind decisions, including app-level host-input and clipboard seams, so detection has a single source of truth.

#### Scenario: Consistent detection across seams
- **WHEN** the app's shortcut, injection, or clipboard modules need the backend kind
- **THEN** they obtain it from the package's exported helpers and no app module implements its own session detection

### Requirement: Automatic KWin bridge initialization
On the Wayland backend the package SHALL create and start the KWin bridge automatically the first time an entry point that requires the bridge is used — controller attachment, overlay activation or focus, or overlay window binding — without an app-side initialization call, and SHALL supply defaults for the bridge's logger, scripts directory, DBus service name, and shortcuts.

#### Scenario: Attach without explicit initialization
- **WHEN** the app attaches an overlay window by title on a KDE Wayland session without initializing the package
- **THEN** the package creates and starts the KWin bridge automatically and game tracking, overlay placement, and activation operate through it

#### Scenario: Overlay window bound before the bridge exists
- **WHEN** the app binds its overlay window to the package before any other bridge use
- **THEN** the package initializes the bridge under the hood and the bound window is mirrored by the bridge

#### Scenario: Explicit initialization overrides defaults
- **WHEN** the app initializes the bridge explicitly with its own options before the first bridge use
- **THEN** the package uses exactly those options and the automatic defaults do not replace them

#### Scenario: No bridge on other backends
- **WHEN** the app runs on Windows, macOS, or an X11 session without initializing the package
- **THEN** no KWin bridge is created and the controller delegates to the original implementation

### Requirement: Automatic bridge shutdown on app quit
The package SHALL stop a bridge it auto-initialized when the Electron app quits, without the app wiring a stop handler.

#### Scenario: Quit without app-side stop wiring
- **WHEN** the Electron app quits after using the auto-initialized Wayland overlay
- **THEN** the package stops the bridge itself and unloads the compositor integration it installed

### Requirement: Initialization-order-independent seam subscriptions
The package SHALL export shortcut and cursor subscription helpers that deliver compositor events to the app regardless of whether the subscription happens before or after the bridge is initialized.

#### Scenario: Subscribe before first use
- **WHEN** the app subscribes to shortcut events through the exported helper before any overlay attachment
- **THEN** the subscription is retained and receives shortcut events once the bridge initializes and the compositor emits them

#### Scenario: Subscribe after initialization
- **WHEN** the app subscribes to cursor events after an overlay attached
- **THEN** the events are delivered from the running bridge
