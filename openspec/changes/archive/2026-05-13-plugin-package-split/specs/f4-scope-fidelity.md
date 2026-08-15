# F4 Scope Fidelity Audit

Result: NOT APPROVED

## Scope Inputs

- Plan reviewed: `.sisyphus/plans/plugin-package-split.md`
- Required inventory command reviewed: `git diff --stat`
- Additional inventory reviewed: `git status --short`, package file list, moved core source comparisons, and guardrail pattern scans

## In-Scope Surfaces Observed

- Workspace conversion is present: root `package.json` is private and declares `packages/*` workspaces.
- Core package relocation is present: `packages/core/package.json` preserves `@system-ui-js/file-system-browser`.
- Plugin packages are present: `packages/plugin-memory`, `packages/plugin-indexeddb`, and `packages/plugin-webdav`.
- Core export removal is present: `packages/core/src/index.ts` does not export storage plugin factories.
- Demo/docs migration is present: `demo/main.ts` and `README.md` import plugin factories from standalone plugin packages.
- Release automation is present: `.github/workflows/publish.yml` builds/tests/packs and publishes `packages/core` before plugin packages.

## Guardrail Checks

- Legacy plugin factory exports in core: PASS. No `create(Memory|IndexedDB|WebDAV)StoragePlugin` matches in `packages/core/src/index.ts`.
- Duplicate core in plugin source imports: PASS. No plugin package deep-imports `../fs`, `../db`, or core `src` internals.
- Source aliasing as final demo verification: PASS. `vite.demo.config.ts` uses package export conditions and no root source alias.
- Unrelated package splits: PASS for package manifests. No `sort`, `demo`, or SDK package manifest was found under `packages/*`.
- Core zero-config IndexedDB story: PASS. README and demo use explicit IndexedDB plugin registration.
- Core fs/sort behavior drift: PASS. Comparisons of moved `fs.ts` and `sort.ts` showed formatting-only differences outside planned export/removal changes.

## Out-of-Scope Changes Blocking Approval

1. `EOF`
   - Empty untracked file at repo root.
   - No coverage in workspace conversion, plugin extraction, demo/test validation, or release automation tasks.

2. `test-results/.last-run.json`
   - Tracked Playwright/test-run state is deleted.
   - This is not a planned implementation, package-boundary, API, demo, docs, or release automation surface.

3. `packages/plugin-memory/system-ui-js-file-system-plugin-memory-0.1.0.tgz`
   - Generated tarball artifact is untracked inside a plugin package.
   - Task 8 requires pack smoke proof, but does not cover checking generated tarballs into package source directories.

4. `packages/plugin-indexeddb/system-ui-js-file-system-plugin-indexeddb-0.1.0.tgz`
   - Generated tarball artifact is untracked inside a plugin package.
   - Task 8 requires pack smoke proof, but does not cover checking generated tarballs into package source directories.

## Decision

NOT APPROVED. Remove or explicitly justify the out-of-scope files above before F4 can approve.
