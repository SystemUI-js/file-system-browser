# Tasks

## Plan: root-plugin-mounting

### Wave 1: Core Validation + Resolver Updates

- [x] 1. Enforce root-only mount path validation in `src/fs.ts`
  - Update `normalizeMountPath()` and the `usePlugin()` mount validation flow so only direct-root mount paths are accepted.
  - Treat any multi-segment mount path such as `/webdav/nested` as invalid even if no parent mount exists.
  - Standardize the rejection text to `mountPath 必须是根目录下的一级路径，例如 /memory`.

- [x] 2. Remove nested-mount routing assumptions from resolver helpers
  - Refactor mount resolution helpers in `src/fs.ts` so root-mounted plugins continue to own all descendants under their root, but nested-plugin precedence is gone.
  - Update `resolvePluginForPath()`, `mountedRootForPath()`, `mountRootNames()`, and any helper logic that currently depends on longest-prefix nested matching.
  - Ensure `readdir('/')` still surfaces top-level mount roots exactly once.

### Wave 2: Tests, Demo, Docs, and Verification Prep

- [x] 3. Replace nested-mount unit coverage with root-only acceptance/rejection tests
  - Rewrite the nested-mount assertions in `src/plugin.test.ts` and `src/memory-plugin.test.ts` so they prove the new contract.
  - Root-level mounts succeed, nested `mountPath` values fail with `mountPath 必须是根目录下的一级路径，例如 /memory`.
  - Duplicate root mounts still fail.
  - Descendant paths under a valid root mount still resolve correctly.

- [x] 4. Align demo, E2E, and docs with root-only mount rules
  - Update the demo mount-path input flow, any user-facing copy, and documentation/examples so they no longer advertise relative or nested plugin mount paths.
  - Replace E2E coverage that assumes nested paths with assertions that invalid nested input is rejected.

### Final Verification Wave

- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [x] F4. Scope Fidelity Check — deep
