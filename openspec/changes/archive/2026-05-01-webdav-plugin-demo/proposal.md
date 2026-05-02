# Proposal: WebDAV Plugin and Mounted Demo Integration

## Why

参照 indexeddb 插件能力，增加支持 WebDAV 插件，并在 demo 中默认接入。

Demo must support multiple plugin entries simultaneously, mounted under different directories like Linux `mount`. WebDAV configuration is entered via demo UI. WebDAV config persistence must be exposed as hooks/functions so users can choose; demo default stores config in memory only. `/webdav` must be hidden until configured.

## What Changes

Enable WebDAV as a first-class storage plugin while evolving the plugin system from regex-only interception to deterministic mount-aware routing without breaking existing consumers.

### Core Changes

- `src/fs.ts`: mount-aware plugin metadata, resolver, virtual root handling, and centralized path translation.
- `src/plugins/indexeddb.ts`: optional mounted mode via `mountPath?: string`, default catch-all unchanged.
- `src/plugins/webdav.ts`: WebDAV plugin factory/options and handler mapping.
- `src/index.ts`: public exports for WebDAV plugin and new option types.
- `package.json`/lockfile: add `webdav` dependency.
- `demo/index.html`, `demo/main.ts`, optional `demo/style.css`: WebDAV config UI and mount-root UX.
- `src/plugin.test.ts` and/or new focused test file: mount + WebDAV unit coverage.
- `e2e/demo.spec.ts`: demo visibility/configuration coverage.
- `README.md`: mount semantics, WebDAV usage, CORS/browser limitations.

## Capabilities

- Backward compatibility for regex-only plugins using `FsPlugin.match`.
- Deterministic longest-prefix mount resolution.
- Unique internal mount identity for every mounted plugin instance.
- Explicit cross-mount failure for `rename`, `copyFile`, `link`, and fd operations.
- `ENOTSUP`-style errors for WebDAV unsupported features: symlink, hardlink, watch, browser streams, fd-style open/read/write/close.
- Memory-only WebDAV config by default in demo; persistence hooks exposed but not used for durable credential storage.

## Impact

- Existing library consumers using regex-only plugins continue to work.
- Demo behaves like a mounted filesystem browser: `/indexeddb` exists by default and `/webdav` appears only after configuration.
- WebDAV plugin handles supported WebDAV file operations and explicitly rejects unsupported filesystem semantics.

## Must NOT Have

- No source-code credential defaults, sample passwords, or localStorage credential persistence by default.
- No WebDAV catch-all mount.
- No silent delegation from unsupported WebDAV operations into IndexedDB.
- No server-side WebDAV implementation.
- No breaking change to existing plugin registration or legacy IndexedDB catch-all usage.
