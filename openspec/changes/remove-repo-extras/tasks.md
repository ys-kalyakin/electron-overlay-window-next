# Tasks

Note: the working tree currently carries uncommitted in-flight work (modified `README.md`, `src/**`, `tests/**`, untracked `openspec/changes/archive/2026-11-02-auto-init-kwin-bridge/` and `tests/kwin-bridge.test.ts`). The tasks below must not touch or revert any of it.

## 1. Remove tracked artifacts

- [x] 1.1 Run `git rm -r .zcode` to remove the 6 skills and 6 `/opsx:*` command files; verify with `git ls-files .zcode` returning nothing and the directory absent from the working tree
- [x] 1.2 Run `git rm PORTING.md`; verify with `git ls-files PORTING.md` returning nothing and `grep -rn "PORTING" --exclude-dir=node_modules --exclude-dir=.git .` finding no remaining references

## 2. Guardrail and knowledge preservation

- [x] 2.1 Add a `.zcode/` line under the `# Tool-local state` section of `.gitignore`, next to `.mimosa/`; verify with `git check-ignore -v .zcode/test-file` reporting the matching rule
- [x] 2.2 Re-read the current `README.md` (it carries in-flight edits — preserve them) and insert a short `## Security` section between `## API` and `## Development`, stating that generated KWin scripts are written only inside the configured scripts directory (`KWinBridge.writeScript` resolves the target and rejects paths escaping it) and that behavior for the package's internal fixed file names is unchanged; verify the heading is present and no other README content changed (via `git diff README.md`)

## 3. Verification

- [x] 3.1 Run `npm run lint && npm run check-types && npm test && npm run build` and confirm all pass, proving nothing referenced the removed files
- [x] 3.2 Run `git status --short` and confirm it shows exactly the 13 deletions, the `.gitignore` and `README.md` edits, plus the pre-existing in-flight changes — nothing else

## 4. Correction (post-apply, user feedback)

- [x] 4.1 Restore the 12 `.zcode/` files to the working tree without staging (`git restore --source=6766007 --worktree -- .zcode/`), keeping them untracked and ignored per the corrected scope; verify all 12 files exist, `git ls-files .zcode` is empty, `git check-ignore -v` reports the `.gitignore:153` rule, and `git status --short` shows no `.zcode` entries

## Workflow follow-up

- Commit the cleanup (single commit; see design.md Migration Plan) when the user asks.
- Archive the change with the `openspec` CLI after implementation is complete — the project-local `/opsx:*` slash commands are removed by this change, so use the CLI (`openspec archive remove-repo-extras`).
