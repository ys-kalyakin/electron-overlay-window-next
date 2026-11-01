# Spec Delta

## MODIFIED Requirements

### Requirement: Overlay attachment to the game window
The main process SHALL create the overlay as a transparent, frameless, always-on-top window bound to the game window bounds (via the overlay backend package), and SHALL keep it aligned when the game window moves or is resized.

#### Scenario: Game window is moved
- **WHEN** the Path of Exile 2 window changes position or size
- **THEN** the overlay bounds follow the new game window bounds

#### Scenario: Game is not running
- **WHEN** no Path of Exile 2 window can be found
- **THEN** the app retries detection and does not show the overlay over unrelated windows
