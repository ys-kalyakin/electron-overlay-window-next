# Planning artifacts

Copied from `Exiled-Exchange-2/openspec/changes/extract-overlay-npm-package/`
(2026-11-01), where this package was planned with OpenSpec.

- `proposal.md` — why the package exists and what changes
- `design.md` — technical blueprint (decisions D1–D10) for the port
- `specs/` — behavior deltas: `overlay-backend-package` is this package's
  capability; `wayland-overlay-backend` and `overlay-windowing` are the
  app-side capabilities they modify
- `tasks.md` — groups 1–3 are executed in THIS repository; groups 4–5 (app
  migration) happen in the Exiled Exchange 2 fork after a tagged release of
  this package

The artifacts are written in English (the fork's OpenSpec convention) and
reference fork-side paths where context requires it.
