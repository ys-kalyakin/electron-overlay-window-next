# Design

## Context

`.zcode/` and `PORTING.md` are git-tracked; `grep` over the repo (docs, CI, configs, sources) shows no references to either outside themselves. The `overlay-backend-package` spec describes only package runtime behavior, so removing repo files needs no spec delta — the change runs with `skip_specs: true` (see proposal.md). The npm tarball is already limited to `dist`, `README.md`, `LICENSE` via `files` in `package.json`, so none of the deletions affect publishing.

## Goals / Non-Goals

**Goals:**

- `.zcode/` (12 tracked files) and `PORTING.md` are removed from git and from the working tree.
- The one piece of knowledge inside `PORTING.md` that outlives the port — the `writeScript` path-containment hardening — survives in `README.md`.
- The working tree cannot silently re-track agent tooling: `.zcode/` is ignored going forward.
- The cleanup is verifiable: tracked-file list and the full CI suite (`lint`, `check-types`, `test`, `build`) stay green.

**Non-Goals:**

- Removing or reorganizing `openspec/` (main specs and change archive stay, including the uncommitted `2026-11-02-auto-init-kwin-bridge` work).
- Touching the modified files currently in the working tree (`README.md`, `src/**`, `tests/**`) beyond the one README addition.
- Any change to package code, tests, CI, dependencies, or npm package contents.
- Committing or pushing — the apply phase stages nothing on its own beyond what the tasks direct.

## Decisions

- **D1: Untrack the whole `.zcode/` directory, not just `skills/`.** The six `opsx/*.md` command files are thin wrappers that trigger the skills; untracking only one half breaks the pair. Corrected during apply per user feedback: the files must stay on the local disk, so the scope is git-untracking, not deletion — the `/opsx:*` workflow keeps working locally while fresh clones no longer receive the files. Alternative considered — keeping files tracked — rejected by the user.

- **D2: Untrack via git, not plain deletion, for tracked files.** The removal must be explicit in `git status`. Applied first as `git rm` (which also deletes from the worktree), then corrected: the `.zcode/` files were restored to the worktree with `git restore --source=6766007 --worktree -- .zcode/` — staging-free — and remain untracked thanks to D3. `PORTING.md` remains fully deleted.

- **D3: Add `.zcode/` to `.gitignore` as a guardrail.** Placed in the existing "Tool-local state" section next to `.mimosa/`. Rationale: if agent tooling is regenerated later (e.g., by `openspec init`), the directory must not re-enter version control by accident. Alternative considered — no ignore entry, on the theory that absent files need no rule — rejected: regeneration is a realistic event and the cost of the entry is one line.

- **D4: Preserve the security note as a short `## Security` section in `README.md`.** One or two sentences between `## API` and `## Development`: generated KWin scripts are written only inside the configured scripts directory — `KWinBridge.writeScript` resolves the target and rejects paths escaping it; behavior for the package's internal fixed file names is unchanged. Alternative considered — dropping `PORTING.md` without preserving anything — rejected: the hardening is a published-package property invisible from the spec, and losing its rationale invites future "simplification". The apply phase must re-read the then-current `README.md` (it is modified in-flight right now) and append the section without disturbing unrelated edits.

- **D5: Verification is CI parity.** Since no code changes, the check is: `git ls-files` no longer lists `.zcode/**` or `PORTING.md`; `npm run lint && npm run check-types && npm test && npm run build` all pass, proving nothing referenced the removed files.

## Risks / Trade-offs

- [Loss of the `/opsx:*` slash commands in this repo, including the command that produces planning artifacts] → The `openspec` CLI remains the functional core; directories are regenerable. Recorded as an accepted trade-off (user-confirmed).
- [Losing port history when `PORTING.md` goes] → Git history retains the file (`git log --follow PORTING.md`); only the still-relevant deviation is promoted to `README.md` (D4).
- [Accidental re-tracking of regenerated `.zcode/`] → Mitigated by the `.gitignore` entry (D3).

## Migration Plan

Single commit from the apply phase: `git rm -r .zcode PORTING.md`, the `.gitignore` line, the README section, then CI parity. Rollback: `git revert` of that commit restores everything; no data migration or external systems involved.

Post-push correction (user feedback): the 12 `.zcode/` files were restored to the working tree — untracked and ignored, per D1/D2 — so the pushed commit's recorded untracking is the intended end state; no history rewrite needed.
