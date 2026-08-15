# Tasks

## Plan: webdav-plugin-demo

### Wave 1

- [x] 1. Add mount-aware plugin dispatch in `src/fs.ts`
  - Extend `FsPlugin` and `ActivePlugin` with optional `mountPath?: string`
  - Add internal `mountId` and plugin-local path translation
  - Normalize mount paths as absolute POSIX paths
  - Update resolver to choose longest boundary-matched `mountPath` first
  - Define virtual-root behavior for mount roots and root listings

- [x] 2. Update IndexedDB plugin for mounted and legacy modes
  - Change `IndexedDBStoragePluginOptions` to `{ mountPath?: string }`
  - Keep `match: /^\/(?:.*)$/` for legacy mode
  - Support mounted mode with `mountPath: '/indexeddb'`

- [x] 3. Add WebDAV dependency and public API scaffold
  - Add `webdav` dependency to `package.json`
  - Create `src/plugins/webdav.ts` with `WebDAVStoragePluginOptions`
  - Export factory and types from `src/index.ts`

### Wave 2

- [x] 4. Implement WebDAV storage handlers
  - Implement handlers for `readFile`, `writeFile`, `appendFile`, `readdir`, `stat`, `lstat`, `mkdir`, `rm`, `unlink`, `rmdir`, `rename`, `copyFile`, `exists`, `access`, `diskUsage`
  - Convert WebDAV `FileStat` to local `Stats`/`Dirent` shapes
  - Throw deterministic `ENOTSUP` errors for unsupported operations

- [x] 5. Integrate mounted plugins and WebDAV configuration in demo
  - Update demo imports to include `createWebDAVStoragePlugin`
  - Add WebDAV config UI to `demo/index.html`
  - Add memory-only config store in `demo/main.ts`
  - Connect/disconnect flow for WebDAV mount

- [x] 6. Update documentation for mounts and WebDAV
  - Update `README.md` plugin section
  - Document `mountPath`, virtual roots, longest-prefix precedence
  - Add WebDAV plugin usage examples
  - Document browser CORS requirement and unsupported operations

### Wave 3

- [x] 7. Expand unit test coverage for mounts and WebDAV
  - Add Vitest tests for mount resolver, root virtual entries, mounted IndexedDB
  - Add WebDAV mocked client behavior tests
  - Add unsupported WebDAV operations tests
  - Add cross-mount rejection tests

- [x] 8. Verify demo E2E, build, and package behavior
  - Update Playwright tests for mounted root behavior
  - Run `yarn build`, `yarn build:demo`, `yarn test:unit -- --run`, `yarn test:e2e`
  - Capture failures and fix within scope

### Final Verification Wave

- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright)
- [x] F4. Scope Fidelity Check — deep
