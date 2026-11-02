# Proposal

## Why

The repository carries files that serve local agent tooling and a finished port, not the package: `.zcode/` (6 OpenSpec skills plus 6 `/opsx:*` slash commands) is tracked in git although nothing in the project references it, and `PORTING.md` documents a port that is complete (all re-include checklist items are checked) while linking to the already-removed `planning/` directory. They are clutter for contributors and hide the actually meaningful repo surface.

## What Changes

- Untrack the whole `.zcode/` directory from git — 6 skills (`openspec-propose`, `openspec-apply-change`, `openspec-archive-change`, `openspec-sync-specs`, `openspec-update-change`, `openspec-explore`) and 6 commands (`opsx/{propose,apply,archive,sync,update,explore}.md`) — while keeping the files on the local disk (corrected during apply: the skills are needed locally). The `/opsx:*` slash commands keep working where the files already exist; fresh clones no longer receive them, and the `.gitignore` entry prevents re-tracking.
- Remove `PORTING.md`. Its single still-relevant fact — the `writeScript` path-containment hardening that deviates from the imported upstream source — is preserved as a brief note in `README.md`.
- Add `.zcode/` to `.gitignore` in the tool-local state section (next to `.mimosa/`), so agent tooling regenerated later is never tracked again.
- No changes to package code, tests, CI, dependencies, or npm package contents (`files` already limits the published tarball to `dist`, `README.md`, `LICENSE`).
- `openspec/` (main specs and the change archive) stays as the planning home; the uncommitted `2026-11-02-auto-init-kwin-bridge` archive and the modified source files currently in the working tree are in-flight work and are not touched.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none — this is a pure repository cleanup: tooling and docs only, no spec-level behavior of the package changes. The change sets `skip_specs: true`.)

## Impact

- Git-tracked deletions: 1 file (`PORTING.md`), plus 12 files under `.zcode/` untracked but kept locally; edits to `.gitignore` and `README.md`.
- Agent workflows inside this repo lose their slash commands and project skills (the `/opsx:propose` command that produced this very change is among them).
- Unaffected: `src/`, `tests/`, `.github/workflows/ci.yml`, npm publishing surface, `openspec/`.
- Untracked local state (`dist/`, `.mimosa/`, `node_modules/`) is already gitignored and out of scope.
