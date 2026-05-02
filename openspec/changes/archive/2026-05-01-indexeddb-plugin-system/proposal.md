# Proposal: IndexedDB Storage Plugin Integration

## Why

The project needed to extract the current IndexedDB-backed file storage into an opt-in first-class plugin, keeping the package main system unmounted by default while enabling explicit plugin mounting in the demo. This refactoring improves modularity, allows custom storage backends, and provides a cleaner architecture for the file system browser.

**Background** (from Context):
- Original request: 完善插件系统，把当前项目中的 indexeddb 存储能力作为插件接入主系统，并完善 README。
- Interview summary confirmed the mount strategy (main system does NOT auto-mount IndexedDB; demo explicitly mounts it).
- Metis review addressed gaps: behavior-preserving extraction, preserving exports and dual callback/Promise behavior, keeping existing DB names unchanged.

## What Changes

- Created `src/plugins/indexeddb.ts` with `createIndexedDBStoragePlugin` factory
- Added public export from `src/index.ts` for the plugin factory and its option type
- Updated `demo/main.ts` to explicitly register/use IndexedDB plugin before first fs operation
- Added Vitest unit test infrastructure with fake-indexeddb
- Rewrote/expanded README as a complete plugin development guide

## Capabilities

- IndexedDB storage plugin factory (`createIndexedDBStoragePlugin`) exported from the package
- Main `fs` plugin system preserved with no default IndexedDB auto-mount
- Demo initialization explicitly registers/uses the IndexedDB plugin
- Vitest unit coverage plus Playwright e2e compatibility coverage
- README plugin development guide with IndexedDB plugin usage and migration notes

## Impact

- **Package behavior**: Main package no longer auto-mounts IndexedDB; explicit mount required
- **Existing data**: FileSystemDB and file store schema remains unchanged (no data loss)
- **Public exports**: Existing exports from `src/index.ts` remain compatible
- **Plugin APIs**: `registerPlugin`, `usePlugin`, `unregisterPlugin` continue working
- **Demo functionality**: Preserved via explicit plugin mounting

## Deliverables

- `src/plugins/indexeddb.ts` - IndexedDB plugin factory file
- Public export from `src/index.ts` for the plugin factory and its option type
- Demo import and initialization mount in `demo/main.ts` before first fs operation
- Vitest setup, scripts, and tests for plugin lifecycle/routing/storage behavior
- Playwright e2e coverage proving demo still stores, lists, reads, and clears files
- README rewritten/expanded around plugin concepts, lifecycle, IndexedDB plugin usage, testing, and migration

## Definition of Done

- `yarn build` exits `0`
- `yarn test:unit -- --run` exits `0`
- `yarn test:e2e` exits `0`
- `yarn lint` exits `0`
- README contains sections for plugin overview, lifecycle API, handler contracts, IndexedDB plugin mounting, custom plugin example, testing guidance, and migration notes
