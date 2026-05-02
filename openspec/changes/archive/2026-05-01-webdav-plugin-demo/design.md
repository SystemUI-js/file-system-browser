# Design: WebDAV Plugin and Mounted Demo Integration

## Context

### Current Plugin System Architecture

**Plugin Types (src/fs.ts:911-937):**
- `FsPluginContext` provides `baseFs`, `Buffer`, `createFd`, `releaseFd`, `baseWatch`, etc.
- `FsPlugin` has `{ match: RegExp; handlers?: PluginHandlers }`
- `FsPluginFactory<TOptions>` = `(options, ctx) => FsPlugin`
- `ActivePlugin` has `{ name: string; match: RegExp; handlers: PluginHandlers }`

**Plugin Lifecycle (src/fs.ts:939-986):**
- `registerPlugin(name, factory)` stores in `pluginFactories` Map
- `usePlugin(name, options)` instantiates, REPLACES existing by `name` in `activePlugins`
- `unregisterPlugin(name)` filters by `name`
- Only ONE instance per name allowed (replacement behavior)

**Plugin Resolution (src/fs.ts:988-1007):**
- `resolvePluginFromPaths(paths)` finds first regex match for each path
- Checks ALL paths resolve to SAME plugin `name`
- Throws "路径同时匹配到多个不同的插件" if different
- Returns undefined if no match → caller throws "No storage plugin mounted for this path"

**FD Handling (src/fs.ts:202-223, 1178-1201):**
- `FD` type: `{ path: string; position: number; flags: string; plugin?: ActivePlugin }`
- `allocateFd(path, flags, plugin?)` stores plugin reference
- `promises.open()` resolves plugin, calls handler, then stores plugin in fdTable
- `promises.read/write/close` use fdTable to get path, then resolve plugin from path

**Path Utilities (src/fs.ts:147-163):**
- `norm(path)`: ensures leading `/`, strips trailing `/` (except root)
- `parentOf(path)`: returns parent directory path
- `baseOf(path)`: returns basename

### IndexedDB Plugin (src/plugins/indexeddb.ts)
- Empty options interface `IndexedDBStoragePluginOptions {}`
- Catch-all match: `/^\/(?:.*)$/`
- Delegates ALL handlers to `ctx.baseFs` / `ctx.baseWatch` / `ctx.baseCreateReadStream` etc.

### WebDAV npm Package Research Findings

**Package**: `webdav` (npm) - v5.x ESM-based
**GitHub**: https://github.com/perry-mitchell/webdav-client

Browser-compatible import: `import { createClient } from "webdav/web"`

Key limitations for browser use:
1. No streams - `createReadStream`/`createWriteStream` throw exceptions
2. CORS - Server must emit proper CORS headers
3. No custom fetch - Cannot inject custom fetch implementation directly
4. No httpAgent/httpsAgent - Node.js only option

## Goals / Non-Goals

### Goals
- Add mount-aware plugin dispatch in `src/fs.ts`
- Update IndexedDB plugin for mounted and legacy modes
- Add WebDAV dependency and public API scaffold
- Implement WebDAV storage handlers
- Integrate mounted plugins and WebDAV configuration in demo
- Update documentation for mounts and WebDAV
- Expand unit test coverage for mounts and WebDAV
- Verify demo E2E, build, and package behavior

### Non-Goals
- No source-code credential defaults, sample passwords, or localStorage credential persistence by default.
- No WebDAV catch-all mount.
- No silent delegation from unsupported WebDAV operations into IndexedDB.
- No server-side WebDAV implementation.
- No breaking change to existing plugin registration or legacy IndexedDB catch-all usage.

## Decisions

### Decision 1: Mount-Aware Plugin Dispatch
- **Decision**: Extend `FsPlugin` and `ActivePlugin` with optional `mountPath?: string`; add internal `mountId` and plugin-local path translation. Keep `match` required for backward compatibility.
- **Rationale**: Enables deterministic mount-aware routing while preserving legacy regex-only plugin behavior.
- **Alternatives considered**: Remove regex matching entirely - rejected due to backward compatibility requirements.

### Decision 2: Longest Prefix Mount Resolution
- **Decision**: Update resolver to choose the longest boundary-matched `mountPath` first, then fall back to legacy `match` first-match behavior.
- **Rationale**: Matches Linux mount semantics and ensures predictable routing.

### Decision 3: WebDAV Browser Import
- **Decision**: Use `import { createClient } from 'webdav/web'` for browser compatibility.
- **Rationale**: Version 5 provides ESM-only bundle; `webdav/web` is the browser-specific entry point.
- **Alternatives considered**: Use `webdav` generic import - rejected because bundlers may not handle it correctly for browser.

### Decision 4: Memory-Only WebDAV Config in Demo
- **Decision**: Default implementation stores only module memory for WebDAV config.
- **Rationale**: Security requirement to avoid credential persistence by default.
- **Alternatives considered**: localStorage/sessionStorage persistence - rejected due to security concerns.

### Decision 5: Virtual Root Behavior
- **Decision**: `readdir('/')` merges mounted root names with catch-all/base results and de-duplicates by name; `stat/lstat/access/exists` for mount roots succeeds as directory; deleting/renaming/mkdir over mount roots fails with `EBUSY` or `ENOTSUP`.
- **Rationale**: Provides clean UX for mount browsing while protecting mount points from accidental mutation.

## Risks / Trade-offs

### Risk 1: Backward Compatibility
- **Risk**: Changes to plugin dispatch may break existing consumers using regex-only plugins.
- **Mitigation**: Keep `match` required for backward compatibility; preserve legacy `usePlugin` replacement behavior.

### Risk 2: CORS Limitations
- **Risk**: WebDAV requests may fail due to browser CORS policies.
- **Mitigation**: Document CORS requirement clearly; treat CORS/auth failures as user-facing configuration errors.

### Risk 3: WebDAV Unsupported Operations
- **Risk**: Users may expect full fs API support from WebDAV plugin.
- **Mitigation**: Explicitly reject unsupported operations with deterministic `ENOTSUP` errors; document limitations.

### Risk 4: Concurrent Updates
- **Risk**: `appendFile` performs a read-then-write merge without optimistic concurrency or retry guard, which can lose concurrent updates on the same remote file.

### Risk 5: Code Quality
- **Risk**: `src/fs.ts` has quality regressions including Biome errors in callback usage and `any`/non-null-assertion warnings.
- **Mitigation**: Address in future refactoring.

### Risk 6: Demo UX Issues
- **Issue**: Upload button label semantics are inverted/confusing.
- **Issue**: `clearAllBtn` always clears IndexedDB regardless of current view.

### Risk 7: Environment Limitations
- **Risk**: Playwright cannot run on Ubuntu 26.04 (no Chromium support), limiting automated E2E verification.
- **Mitigation**: Rely on static code analysis and unit tests.

## Migration Plan

N/A - This is a new feature, not a migration.

## WebDAV Package API Reference

### createClient Signature
```typescript
function createClient(
  remoteURL: string,
  options?: WebDAVClientOptions
): WebDAVClient;
```

### Key Client Methods
- `getFileContents(filename, options)` - Read file
- `getDirectoryContents(path, options)` - List directory
- `stat(path, options)` - Get file stats
- `exists(path, options)` - Check existence
- `putFileContents(filename, data, options)` - Write file
- `createDirectory(path, options)` - Create directory
- `deleteFile(filename, options)` - Delete file
- `moveFile(filename, destination, options)` - Move/rename
- `copyFile(filename, destination, options)` - Copy file
- `getQuota(options)` - Get disk quota

### FileStat Shape
```typescript
interface FileStat {
  filename: string;
  basename: string;
  lastmod: string;
  size: number;
  type: "file" | "directory";
  etag: string | null;
  mime?: string;
  props?: DAVResultResponseProps;
}
```
