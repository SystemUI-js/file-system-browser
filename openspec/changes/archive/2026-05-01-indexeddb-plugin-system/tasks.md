# Tasks

## Plan: indexeddb-plugin-system

All tasks completed as per the implementation plan.

### Wave 1

- [x] 1. Add Vitest unit test infrastructure

  Added Vitest as a dev dependency, added `test:unit` script to `package.json`, added minimal Vitest config with jsdom environment and fake-indexeddb for browser-like IndexedDB mocking.

- [x] 2. Extract IndexedDB storage into an opt-in plugin factory

  Created `src/plugins/indexeddb.ts` exporting `createIndexedDBStoragePlugin` and options type. Registered under plugin name `indexeddb`. Default `match` handles all absolute POSIX paths (`/^\/(?:.*)$/`). Reuses existing `FileSystemDB` singleton without changing DB/store names.

- [x] 5. Draft README plugin guide structure

  Reorganized README plugin material into a complete guide outline including: overview, why plugins are opt-in, lifecycle API, factory/context contract, path matching and conflict rules, IndexedDB storage plugin usage, custom plugin example, testing/debugging guidance, migration notes, and sort persistence out-of-scope note.

### Wave 2

- [x] 3. Export plugin factory and mount it explicitly in the demo

  Exported `createIndexedDBStoragePlugin` and its option type from `src/index.ts`. Updated `demo/main.ts` imports to include the plugin factory plus `registerPlugin`/`usePlugin`. In `init()`, register/use the plugin before `refreshFileList()` and `refreshStorageInfo()`. Added idempotent guard logic.

- [x] 4. Add unit coverage for plugin lifecycle, routing, and storage behavior

  Added Vitest tests covering `registerPlugin`, `usePlugin`, `unregisterPlugin`, duplicate/conflicting route behavior, Promise and callback wrappers, fd/open/read/write/close routing, and IndexedDB plugin storage operations. Includes failure cases: duplicate route/plugin ID, different plugins matching multi-path operations, and IndexedDB unavailable/open failure.

- [x] 6. Finalize README examples against exported APIs

  Updated README code examples to match final exports. Shows import of `createIndexedDBStoragePlugin`, `registerPlugin`, and `usePlugin`. Demonstrates demo/app mount sequence using plugin name `indexeddb`. Documents failure behavior for conflicts and missing plugins.

### Wave 3

- [x] 7. Extend Playwright e2e compatibility coverage

  Updated `e2e/demo.spec.ts` to prove the demo works with explicit IndexedDB plugin mount: initial load, create folder, upload/write file, read/list display, persistent storage/status path, clear/delete path.

### Final Verification Wave

- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [x] F4. Scope Fidelity Check — deep

## Dependency Matrix

- Task 1 blocks Task 4
- Task 2 blocks Task 3, Task 4, Task 6, Task 7
- Task 3 blocks Task 7
- Task 4 blocks Task 7
- Task 5 blocks Task 6
- Task 6 blocks final verification only
- Task 7 blocks final verification

## Execution Summary

- Wave 1 → 3 tasks → `quick`, `deep`, `writing`
- Wave 2 → 3 tasks → `quick`, `deep`, `writing`
- Wave 3 → 1 task → `unspecified-high`

## Success Criteria

- IndexedDB storage is accessible via an explicit plugin factory and demo mount
- Main package import has no automatic IndexedDB plugin activation side effect
- Existing data remains readable because `FileSystemDB` schema is unchanged
- Unit tests cover lifecycle, routing, callback/Promise compatibility, fd behavior, and failure paths
- Playwright e2e confirms demo behavior remains intact
- README is a complete plugin development guide and accurately describes the opt-in IndexedDB model
