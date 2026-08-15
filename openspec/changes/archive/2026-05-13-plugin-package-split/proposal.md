# Proposal: Extract Browser FS Plugins Into Publishable Workspace Packages

## Why

The current single-package repository bundles all storage plugins (memory, indexeddb, webdav) into the core `@system-ui-js/file-system-browser` package. This creates several problems:

- **Bloated core package**: Consumers who only need IndexedDB must still download WebDAV dependencies
- **Tight coupling**: Plugin implementations are not isolated; they import from core internals (`src/fs.ts`, `src/db.ts`)
- **No independent versioning**: All plugins are forced to the same version as core
- **Hidden default behavior**: IndexedDB was implicitly mounted as default storage, making the plugin system conceptually unclear

The goal is to convert the repository into a Yarn workspace with independently publishable plugin packages while preserving the existing core package name.

## What Changes

1. **Workspace conversion**: Repo root becomes a private Yarn workspace shell with `packages/*` workspaces
2. **Core relocation**: Main package moves to `packages/core` while keeping the published name `@system-ui-js/file-system-browser`
3. **Plugin extraction**: Three new publishable packages created:
   - `@system-ui-js/file-system-plugin-memory`
   - `@system-ui-js/file-system-plugin-indexeddb`
   - `@system-ui-js/file-system-plugin-webdav`
4. **API boundary cleanup**: Core exports plugin registry/types but NOT plugin factory implementations
5. **Consumer migration**: Demo, docs, tests, and README updated to use standalone plugin packages
6. **Release automation**: CI workflow publishes core before plugins, with tarball smoke checks

## Capabilities

- Core package publishes as `@system-ui-js/file-system-browser` (name preserved)
- Each plugin publishes independently under `@system-ui-js/file-system-plugin-*`
- Plugins depend on core via `peerDependencies` (no duplicate core bundles)
- Plugin packages import only public core exports, not root internals
- Explicit plugin registration required for all storage backends (no hidden defaults)
- Workspace-aware build, test, pack, and publish automation
- Demo validates standalone plugin installation model

## Impact

### API Changes (Breaking)
- Core no longer exports `createMemoryStoragePlugin`, `createIndexedDBStoragePlugin`, `createWebDAVStoragePlugin`
- Consumers must install and import plugin factories from standalone packages
- IndexedDB is no longer implicitly mounted; explicit registration required

### Files Changed
- Root `package.json`: made private, added workspaces
- `packages/core/`: relocated core source, removed plugin factories
- `packages/plugin-memory/`, `packages/plugin-indexeddb/`, `packages/plugin-webdav/`: new packages
- `README.md`: updated examples and added migration notes
- `demo/main.ts`: updated imports
- `.github/workflows/publish.yml`: multi-package release workflow

### Verification
- `yarn build` succeeds for all workspaces
- `yarn test:unit -- --run` passes (60 tests)
- `yarn test:e2e` passes (27 tests)
- `npm pack --json` succeeds for all 4 packages
