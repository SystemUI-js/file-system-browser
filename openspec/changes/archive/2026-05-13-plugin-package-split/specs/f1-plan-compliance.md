# F1 Plan Compliance Audit

Date: 2026-05-08
Plan: `.sisyphus/plans/plugin-package-split.md`
Result: NOT APPROVED

## Summary

The implementation satisfies most workspace, package, build, pack, unit, e2e, and publish-order checks, but F1 cannot approve because strict plan compliance has defects. The audit found stale core-based plugin import documentation, a failing plan-level lint command, LSP/lint diagnostics in changed core files, and missing mandatory task evidence artifacts.

## Commands Executed

- `GIT_MASTER=1 git status --short`: working tree contains the claimed split implementation plus `.sisyphus/` evidence; no commit was made.
- `node -e "const root=require('./package.json'); const core=require('./packages/core/package.json'); if(root.private!==true) process.exit(1); if(!Array.isArray(root.workspaces)||root.workspaces[0]!=='packages/*') process.exit(2); if(core.name!=='@system-ui-js/file-system-browser') process.exit(3); console.log('task1-root-ok')"`: passed.
- `yarn workspaces info`: passed and listed all four workspaces.
- `node -e` manifest checks for `packages/plugin-memory`, `packages/plugin-indexeddb`, and `packages/plugin-webdav`: passed.
- `yarn build && yarn test:unit -- --run && yarn test:e2e`: passed; build completed for all workspaces, unit tests passed 4 files / 60 tests, e2e passed 27 tests.
- `yarn install --frozen-lockfile`: passed.
- `yarn lint`: failed with 17 errors and 20 warnings.
- `npm pack --json --dry-run` in `packages/core`, `packages/plugin-memory`, `packages/plugin-indexeddb`, and `packages/plugin-webdav`: passed; all package metadata reported `bundled: []`.
- `grep -Ern "from '../(fs|db)'|from \"\.\./(fs|db)\"" packages/plugin-*`: no output.
- `grep -En "alias:.*src|resolve\(.*src/index\.ts" vite.demo.config.ts`: no output.
- Workflow order script against `.github/workflows/publish.yml`: passed; core publish step precedes plugin publish step and root is not published.
- LSP diagnostics: plugin package entrypoints and `vite.demo.config.ts` clean; `packages/core/src/index.ts` has import/export sort information; `packages/core/src/plugin.test.ts` has import/export sort information and an unused `createWebDAVStoragePlugin` warning.

## Task Audit Matrix

### Task 1: Workspace Root

- PASS: Root `package.json` has `private: true` and `workspaces: ["packages/*"]`.
- PASS: `packages/core/package.json` name is `@system-ui-js/file-system-browser`.
- PASS: `yarn workspaces info` lists `@system-ui-js/file-system-browser`, `@system-ui-js/file-system-plugin-memory`, `@system-ui-js/file-system-plugin-indexeddb`, and `@system-ui-js/file-system-plugin-webdav`.
- PASS: `yarn build` works.
- PASS: Evidence files present: `.sisyphus/evidence/task-1-workspace-root.txt`, `.sisyphus/evidence/task-1-workspace-root-error.txt`.

### Task 2: Public Core Surface

- PASS: `packages/core/src/index.ts` exports `FsPlugin`, `FsPluginContext`, `FsPluginFactory`, `registerPlugin`, `unregisterPlugin`, `usePlugin`, and `BufferEncoding`.
- PASS: No plugin deep imports from `../fs` or `../db` found under `packages/plugin-*`.
- PASS: Build passed after boundary checks.
- PASS: Evidence files present: `.sisyphus/evidence/task-2-public-surface.txt`, `.sisyphus/evidence/task-2-public-surface-error.txt`.

### Task 3: Memory Plugin

- PASS: `packages/plugin-memory/package.json` name is `@system-ui-js/file-system-plugin-memory`.
- PASS: `packages/plugin-memory/package.json` declares peer dependency on `@system-ui-js/file-system-browser`.
- PASS: `npm pack --json --dry-run` succeeds in `packages/plugin-memory`.
- PASS: `packages/plugin-memory/vite.config.ts` externalizes `@system-ui-js/file-system-browser`; packed metadata has `bundled: []`; ES output imports core instead of bundling it.
- DEFECT: Mandatory QA evidence `.sisyphus/evidence/task-3-memory-pack-error.txt` is missing.

### Task 4: IndexedDB Plugin

- PASS: `packages/plugin-indexeddb/package.json` name is `@system-ui-js/file-system-plugin-indexeddb`.
- PASS: README describes explicit plugin registration and states IndexedDB is not hidden default behavior.
- PASS: `npm pack --json --dry-run` succeeds in `packages/plugin-indexeddb`.
- PASS: Evidence files present: `.sisyphus/evidence/task-4-indexeddb-core-failure.txt`, `.sisyphus/evidence/task-4-indexeddb-pack.txt`.

### Task 5: WebDAV Plugin

- PASS: `packages/plugin-webdav/package.json` name is `@system-ui-js/file-system-plugin-webdav`.
- PASS: Root `package.json` has no `webdav` runtime dependency; `packages/plugin-webdav/package.json` owns `webdav` dependency.
- PASS: `npm pack --json --dry-run` succeeds in `packages/plugin-webdav`.
- PASS: No plugin deep imports from `../fs` or `../db` found.
- DEFECT: Mandatory QA evidence `.sisyphus/evidence/task-5-webdav-dependency-error.txt` is missing.

### Task 6: Core Export Removal

- PASS: `packages/core/src/index.ts` does not export `createMemoryStoragePlugin`, `createIndexedDBStoragePlugin`, or `createWebDAVStoragePlugin`.
- PASS: Demo imports plugin factories from plugin packages.
- PASS: README contains plugin package import examples.
- PASS: `packages/core/src/plugin.test.ts` imports plugin factories from plugin packages.
- DEFECT: README still documents old core-based plugin factory imports at `README.md:1015`, `README.md:1016`, and `README.md:1017`, violating the plan guardrail that docs do not reference core-based plugin imports.
- DEFECT: Mandatory QA evidence `.sisyphus/evidence/task-6-core-export-removal-error.txt` is missing.

### Task 7: Demo/Test Boundaries

- PASS: `vite.demo.config.ts` has no source alias matching `alias:.*src` or `resolve(.*src/index.ts`.
- PASS: `yarn test:unit -- --run` passes.
- PASS: `yarn test:e2e` passes.
- DEFECT: Mandatory Playwright screenshot evidence `.sisyphus/evidence/task-7-demo-boundary.png` and `.sisyphus/evidence/task-7-demo-boundary-error.png` is missing; only `.sisyphus/evidence/task-7-demo-boundary.txt` exists.

### Task 8: Release Automation

- PASS: `.github/workflows/publish.yml` installs, builds, runs unit tests, runs e2e tests, and packs all four packages before publish.
- PASS: `.github/workflows/publish.yml` publishes `packages/core` before plugin packages.
- PASS: Workflow publishes from package directories and never publishes the private root.
- DEFECT: Mandatory regression evidence `.sisyphus/evidence/task-8-release-proof-error.txt` is missing.

## Guardrails

- PASS: No plugin package bundles a duplicate copy of core based on Vite external config, packed metadata `bundled: []`, and package ES output retaining core package imports where runtime core symbols are used.
- PASS: Core does not re-export plugin factories from `packages/core/src/index.ts`.
- DEFECT: Docs reference old core-based plugin factory imports in the migration table at `README.md:1015`, `README.md:1016`, and `README.md:1017`.

## Plan-Level Definition of Done

- PASS: `yarn install --frozen-lockfile` succeeds.
- PASS: `yarn build` succeeds.
- FAIL: `yarn lint` fails with 17 errors, including Prettier errors in `packages/core/src/index.ts`, unused `createWebDAVStoragePlugin` in `packages/core/src/plugin.test.ts`, and Prettier errors in `packages/core/src/plugin.test.ts` and `packages/core/src/smoke.test.ts`.
- PASS: `yarn test:unit -- --run` succeeds.
- PASS: `yarn test:e2e` succeeds.
- PASS: `npm pack --json --dry-run` succeeds for core and all three plugin packages.

## Numbered Defect List

1. Task 6 / Guardrails: `README.md:1015`, `README.md:1016`, and `README.md:1017` still reference plugin factories imported from `@system-ui-js/file-system-browser`; the plan explicitly forbids docs referencing core-based plugin factory imports.
2. Plan Definition of Done / Task 8 validation coverage: `yarn lint` fails, so the plan-level lint acceptance command is not satisfied.
3. Task 6 / changed core test hygiene: `packages/core/src/plugin.test.ts:4` imports `createWebDAVStoragePlugin` but never uses it; LSP diagnostics and lint both flag this.
4. Task 3: Mandatory duplicate-core failure-detection evidence `.sisyphus/evidence/task-3-memory-pack-error.txt` is missing.
5. Task 5: Mandatory WebDAV boundary regression evidence `.sisyphus/evidence/task-5-webdav-dependency-error.txt` is missing.
6. Task 6: Mandatory stale-doc/import regression evidence `.sisyphus/evidence/task-6-core-export-removal-error.txt` is missing.
7. Task 7: Mandatory Playwright screenshot evidence `.sisyphus/evidence/task-7-demo-boundary.png` and `.sisyphus/evidence/task-7-demo-boundary-error.png` is missing.
8. Task 8: Mandatory publish-order/scope regression evidence `.sisyphus/evidence/task-8-release-proof-error.txt` is missing.

## Final Decision

NOT APPROVED. Do not mark F1 complete until every numbered defect above is resolved or backed by the exact mandatory evidence required by the plan, and the failing lint command passes.
