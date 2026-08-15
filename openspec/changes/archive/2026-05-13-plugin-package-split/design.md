# Design: Plugin Package Split

## Context

The browser file system library originally bundled all storage backends into a single package. The plugin system existed but was not truly modular—plugins were compiled into the core bundle and core internals were exposed to plugin implementations. This design document captures the architectural decisions made during the workspace conversion.

## Goals

- Convert the repository to a Yarn Classic workspace with a private root
- Keep the published core package name unchanged: `@system-ui-js/file-system-browser`
- Extract memory, IndexedDB, and WebDAV plugins into independently publishable packages
- Ensure plugin packages consume only public core APIs
- Remove hidden default IndexedDB behavior; make plugin registration explicit
- Upgrade CI to handle multi-package build/test/publish

## Non-Goals

- Do NOT split `sort` or `demo` into separate packages
- Do NOT redesign the plugin API surface (registry remains `registerPlugin`/`usePlugin`)
- Do NOT introduce new SDK features or storage backends
- Do NOT preserve legacy compatibility shims for old core-based plugin imports

## Decisions

### 2026-05-07 Task 1: Workspace Root
- Kept plugin packages skeletal but buildable with minimal `src/index.ts` entries
- Plugin packages declare `@system-ui-js/file-system-browser` as a peer dependency and externalize it in Vite UMD builds

### 2026-05-07 Task 2: Public Core Surface
- `packages/core/src/index.ts` is the stable plugin-author barrel
- `BufferEncoding` re-exports from `./fs` alongside `FsPlugin`, `FsPluginContext`, and `FsPluginFactory`
- Plugin packages under `packages/plugin-*` have no `../fs` or `../db` deep imports

### 2026-05-07 Task 3: Memory Plugin
- `packages/plugin-memory` consumes all needed APIs from `@system-ui-js/file-system-browser`, including `Buffer` (aliased as `BufferPolyfill`), `Dirent`, `Stats`, `FileEntry`, and plugin factory/context types
- Vite skeleton already externalizes core; after replacing stub source, bundle builds to non-empty ES/UMD outputs without bundling core

### 2026-05-07 Task 4: IndexedDB Plugin
- `packages/plugin-indexeddb` replaced stub source with core IndexedDB delegate factory
- README examples import `createIndexedDBStoragePlugin` from `@system-ui-js/file-system-plugin-indexeddb` and register `mountPath: '/'`
- Core routing fails unmatched paths with "No storage plugin mounted for this path"

### 2026-05-07 Task 5: WebDAV Plugin
- `packages/plugin-webdav` hosts copied WebDAV factory using only public core imports
- WebDAV ambient declaration for `webdav/web` lives under plugin package `src/types`
- `webdav` runtime dependency moves to `packages/plugin-webdav/package.json`

### 2026-05-07 Task 6: Core Export Removal
- Added plugin packages as `devDependencies` in `packages/core/package.json` (needed for tests only)
- Yarn workspaces automatically symlink workspace packages
- Demo's `vite.demo.config.ts` only aliases core to src; plugin packages resolve through normal node_modules

### 2026-05-07 Task 7: Demo Boundary Validation
- Added custom `source` export condition to each package for local test/demo builds
- `source` condition is separate from `import`/`require` to preserve dist-based metadata for consumers
- Vite/Vitest exercises workspace packages as package imports without root alias

### 2026-05-08 Task 8: Release Automation
- Kept publish workflow as one ordered job: build → unit tests → e2e tests → pack smoke → publish
- Published `packages/core` in its own step before looping over plugin packages
- Added `pack:all` as explicit alias for workspace pack script
- Release uses `npm publish` from each package directory, never `yarn publish` at private root
- Root `test:e2e` launches `vite` directly and kills process after Playwright to avoid CI hangs

## Risks / Trade-offs

### rg Not Available
- `rg` is not installed in this environment; verification evidence records grep fallback output

### Build Warnings
- Existing warnings about `url.parse` deprecation, Vitest/Vite peer range, and mixed named/default exports persist
- These are pre-existing and do not block the workspace conversion

### YAML LSP Diagnostics
- `yaml-language-server` is not installed; workflow structure verified by inspection plus successful release commands

### Lint Issues (F1 Finding)
- `yarn lint` initially failed with 17 errors (Prettier errors, unused imports)
- Fixed in follow-up; F2 code quality review passed with 0 errors

### Missing Evidence Artifacts
- F1 audit found several mandatory QA evidence files missing (task-3-memory-pack-error, task-5-webdav-dependency-error, task-6-core-export-removal-error, task-7-demo-boundary.png, task-8-release-proof-error)
- These were later produced but F1 did not re-approve before work concluded

### Scope Fidelity (F4 Finding)
- Out-of-scope files detected: empty `EOF` file, deleted `test-results/.last-run.json`, untracked tarballs in plugin packages
- F4 NOT APPROVED due to these artifacts

## Migration Plan

### v0.x → v1.x: Plugin Factory Migration

From v1.x, core package no longer exports storage plugin factories. Update imports:

| Plugin | Old Import | New Import |
|--------|-----------|------------|
| IndexedDB | `import { createIndexedDBStoragePlugin } from '@system-ui-js/file-system-browser'` | `import { createIndexedDBStoragePlugin } from '@system-ui-js/file-system-plugin-indexeddb'` |
| Memory | `import { createMemoryStoragePlugin } from '@system-ui-js/file-system-browser'` | `import { createMemoryStoragePlugin } from '@system-ui-js/file-system-plugin-memory'` |
| WebDAV | `import { createWebDAVStoragePlugin } from '@system-ui-js/file-system-browser'` | `import { createWebDAVStoragePlugin } from '@system-ui-js/file-system-plugin-webdav'` |

Install packages:
```bash
yarn add @system-ui-js/file-system-plugin-indexeddb
yarn add @system-ui-js/file-system-plugin-memory
yarn add @system-ui-js/file-system-plugin-webdav
```

Core plugin management APIs (`registerPlugin`, `usePlugin`, `unregisterPlugin`) remain unchanged.
