# Tasks

## Plan: Extract Browser FS Plugins Into Publishable Workspace Packages

### Task 1: Convert the repo into a private workspace root and scaffold all publishable packages

- [x] Convert repo root into private Yarn workspace shell
- [x] Create skeletal workspace manifests for `packages/core`, `packages/plugin-memory`, `packages/plugin-indexeddb`, `packages/plugin-webdav`
- [x] Move current main package into `packages/core` preserving `@system-ui-js/file-system-browser`
- [x] Add root scripts orchestrating build/test/pack across all workspaces
- [x] Verify workspace root is private and core package name preserved
- [x] Verify `yarn workspaces info` lists all four workspaces

### Task 2: Define the stable public core plugin-author surface

- [x] Refactor core package so plugins consume only public exports
- [x] Export `FsPlugin`, `FsPluginContext`, `FsPluginFactory`, `registerPlugin`, `usePlugin`, `BufferEncoding` from core
- [x] Ensure no plugin package deep-imports from `../fs` or `../db`
- [x] Verify build succeeds after boundary extraction
- [x] Confirm old plugin factory exports still exist (removal deferred to Task 6)

### Task 3: Extract the memory plugin into `@system-ui-js/file-system-plugin-memory`

- [x] Create `packages/plugin-memory` with package.json, build config, type output, and tests
- [x] Move/adapt implementation from `src/plugins/memory.ts`
- [x] Declare `@system-ui-js/file-system-browser` as peer dependency
- [x] Ensure bundle externalizes core (no duplicate core bundled)
- [x] Verify `npm pack` succeeds
- [x] Verify packed memory plugin works with packed core

### Task 4: Extract the IndexedDB plugin into `@system-ui-js/file-system-plugin-indexeddb`

- [x] Create `packages/plugin-indexeddb` with manifest/build/test setup
- [x] Move IndexedDB plugin factory out of core
- [x] Make explicit registration the required persistence path
- [x] Update README: "no plugin installed" is failure case
- [x] Verify core without IndexedDB plugin fails predictably
- [x] Verify IndexedDB plugin restores persistent workflow

### Task 5: Extract the WebDAV plugin into `@system-ui-js/file-system-plugin-webdav`

- [x] Create `packages/plugin-webdav` with manifest/build/test setup
- [x] Move `webdav` runtime dependency from root to plugin package
- [x] Adapt implementation to consume only public core APIs
- [x] Add WebDAV ambient declaration under plugin package
- [x] Verify root package no longer depends on `webdav`
- [x] Verify no deep imports from `../fs` or `../db`

### Task 6: Remove plugin factories from core and migrate all in-repo consumers

- [x] Delete plugin factory exports from `packages/core/src/index.ts`
- [x] Update root tests to import from plugin packages
- [x] Update demo code imports
- [x] Update README usage snippets and add migration notes
- [x] Add plugin packages as devDependencies in core (for tests)
- [x] Verify no stale core-based plugin imports remain
- [x] Verify new plugin package imports present in README/demo/tests

### Task 7: Make demo and automated tests validate package boundaries

- [x] Rework unit tests for workspace packages
- [x] Update Playwright demo wiring
- [x] Remove root-source aliasing in `vite.demo.config.ts`
- [x] Add `source` export condition for local test/demo builds
- [x] Preserve mount-path behaviors (`/`, `/memory`, nested mount rejection)
- [x] Verify `yarn test:unit -- --run` passes
- [x] Verify `yarn test:e2e` passes

### Task 8: Replace single-package publish automation with multi-package release proof

- [x] Upgrade GitHub Actions for multi-package publish
- [x] Add tarball-first smoke checks before publish
- [x] Make publish order explicit: core before plugins
- [x] Ensure private root is never published
- [x] Add `pack:all` script alias
- [x] Verify `npm pack` succeeds in all 4 package dirs
- [x] Verify workflow enforces publish order and excludes private root

### Final Verification Wave

- [x] F1. Plan Compliance Audit
- [x] F2. Code Quality Review (APPROVED)
- [x] F3. Real Manual QA (APPROVED)
- [x] F4. Scope Fidelity Check (NOT APPROVED - out-of-scope artifacts)
