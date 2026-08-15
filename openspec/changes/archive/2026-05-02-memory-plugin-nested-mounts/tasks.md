# Tasks

## Plan: memory-plugin-nested-mounts

### Task 1: Add memory storage plugin with unit coverage

- [x] 1. Create `src/plugins/memory.ts` with `MemoryStoragePluginOptions` and `createMemoryStoragePlugin`
- [x] 2. Export `createMemoryStoragePlugin` and `MemoryStoragePluginOptions` from `src/index.ts`
- [x] 3. Add `src/memory-plugin.test.ts` with unit tests for:
  - File CRUD (read, write, append)
  - Directory CRUD (mkdir, readdir, rmdir, rm)
  - Recursive operations (recursive mkdir, recursive rm)
  - Rename and copy
  - Symlink and readlink
  - Hard link and nlink
  - File descriptor operations (open, read, write, close)
  - Streams (createReadStream, createWriteStream)
  - Watch and watchFile
  - Nested mount isolation (`/memory` vs `/memory/nested`)
  - Re-mount lifecycle (unregister then remount loses data)
  - Duplicate mount path rejection
  - Invalid mount path validation

### Task 2: Rework demo manual mount UX with E2E coverage

- [x] 1. Update `demo/main.ts` to register plugins without auto-mounting
- [x] 2. Replace default mount behavior with unified manual mount form
- [x] 3. Update `demo/index.html` with mount form selectors:
  - `#mountPluginSelect`
  - `#mountPathInput`
  - `#mountBtn`
  - `#mountStatus`
  - `#webdavMountFields`
- [x] 4. Implement mount path validation (empty, relative, root, trailing slash, `//`, `.`, `..`)
- [x] 5. Update `e2e/demo.spec.ts` for:
  - No default mount at startup
  - Manual memory mount
  - Invalid mount path errors
  - Nested mount behavior
  - Updated WebDAV tests for unified form

### Task 3: Update README for memory plugin and manual demo mounts

- [x] 1. Remove default demo mount wording
- [x] 2. Add memory plugin usage example
- [x] 3. Add manual mount instructions
- [x] 4. Add nested mount examples
- [x] 5. Clarify memory data is not persisted

### Final Verification

- [x] F1. Plan Compliance Audit
- [x] F2. Code Quality Review
- [x] F3. Real Manual QA
- [x] F4. Scope Fidelity Check
