# Design: Root-Only Plugin Mounts

## Context

`mountPath` must be a direct child of `/` (e.g. `/memory`). Nested mounts are a breaking removal: old nested configs must error. Scope is limited to `mountPath`; legacy `match` semantics stay unchanged.

## Goals / Non-Goals

**Goals:**
- Make root-level plugin mounting the only supported mount shape.
- Enforce root-only mount path validation.
- Simplify resolver helpers by removing nested-mount routing assumptions.
- Align tests, demo, and docs with the new rule.

**Non-Goals:**
- No nested mount support left in resolver, UI, or tests.
- No unrelated filesystem refactor.
- No changes to legacy `match` semantics.

## Decisions

### Decision: Root-only mounts
- **Decision**: Restrict plugin mounts to repository-root entries only and remove nested `mountPath` support.
- **Reason**: Simplifies path resolution and removes complex longest-prefix nested matching logic.
- **Alternatives considered**: Keep nested mounts with longest-prefix precedence.
- **Why not chosen**: Adds unnecessary complexity; root-only mounts cover the primary use cases.

### Decision: Tests-after strategy
- **Decision**: Implementation tasks include test updates within the same task.
- **Reason**: Ensures every behavioral change is immediately verified.
- **Alternatives considered**: Separate test tasks after all implementation.
- **Why not chosen**: Increases risk of untested code and delays feedback.

## Risks / Trade-offs

- Nested mounts are a breaking removal: existing configs with multi-segment `mountPath` will now error.
- Root mount `/` must be handled as a first-class mount path in `src/fs.ts` (follow-up noted in learnings).
- Demo mount disconnection needs a root-aware scope check; `currentPath.startsWith(`${path}/`)` alone is insufficient for `path === '/'`.

## Learnings

### Root-only plugin mount rules (T4)

- `demo/main.ts` `resolveMountPath()` updated to enforce root-only mount paths:
  - Removed relative path resolution against `currentPath`
  - Added early rejection for paths not starting with `/`
  - Added rejection for multi-segment paths (`split('/').filter(Boolean).length > 1`)
  - Kept existing validations for `//`, `.`, `..`, and root `/`
  - Standard error message: `mountPath 必须是根目录下的一级路径，例如 /memory`

- `demo/index.html` placeholder updated from `/memory 或 nested（相对当前路径）` to `/memory`

- E2E tests replaced:
  - Relative mount test -> rejection test for `nested`
  - Nested mount test -> rejection test for `/memory/nested`
  - Existing `/memory` success test preserved

- README.md updated:
  - Removed nested mount mention from demo section
  - Updated longest-prefix section to clarify root-only mounts, no precedence needed

- Also fixed a pre-existing e2e test bug: `should show error for invalid mount paths` incorrectly expected `currentPath` to reset to `/` after validation errors when it had already changed to `/foo` from a successful prior mount. Updated expectations to `/foo` for those assertions.

- `yarn test:e2e` passes: 26/26 tests.

### QA Verification - 2026-05-02
- Unit tests: `yarn test:unit -- --run` passed, 4 files / 56 tests.
- Build: `yarn build` exited 0.
- Filtered lint for changed files found only baseline issues: `demo/main.ts:162`, `e2e/demo.spec.ts:66`, and `no-explicit-any` warnings.
- Verdict: APPROVE; no new lint errors introduced in changed files.

### Root mount support follow-up
- Root mount `/` must be handled as a first-class mount path in `src/fs.ts`:
  - `normalizeMountPath()` should allow `/`.
  - `resolvePluginForPath()` must prefer specific child mounts over the root mount.
  - `virtualRootReaddir()` should merge the root-mounted plugin's `readdir('/')` output with mounted root names.
- Demo mount disconnection needs a root-aware scope check; `currentPath.startsWith(`${path}/`)` alone is insufficient for `path === '/'`.
- E2E root-mount coverage should use typed access to `window.refreshFileList` instead of `as any`.

## Execution Strategy

### Parallel Execution Waves
- Wave 1: core validation + resolver updates
- Wave 2: tests, demo, docs, and verification prep

### Dependency Matrix
- T1 blocks T2, T3, T4.
- T2 blocks final verification only.
- T3 blocks final verification only.
- T4 blocks final verification only.
