# Design: IndexedDB Storage Plugin System

## Context

The file system browser originally had IndexedDB storage built directly into the core package. The project needed to refactor this into an opt-in plugin system to:
- Allow users to choose their storage backend
- Enable custom plugins (WebDAV, cloud storage, etc.)
- Keep the main package lightweight with no default side effects
- Maintain backward compatibility with existing data and API contracts

**Key Learnings** (from notepads):
- Vitest requires jsdom environment for browser-like testing
- fake-indexeddb must be set up globally for IndexedDB mocking in unit tests
- Test files (`*.test.ts`) must be excluded from tsconfig.json build to avoid TypeScript errors
- Yarn scripts forward flags with `--` convention

## Goals / Non-Goals

### Goals
- IndexedDB file storage becomes an opt-in plugin
- Preserve current package behavior contracts
- Keep demo functionality working by explicit plugin mounting
- Maintain Promise and callback dual API behavior
- Keep existing IndexedDB DB/store names unchanged

### Non-Goals
- No automatic main-system IndexedDB mount
- No schema rename/migration for `FileSystemDB`
- No refactor of `src/sort-db.ts`
- No breaking rename/removal of existing public APIs
- No manual-only QA acceptance criteria

## Decisions

### Decision 1: Plugin Name and Match Pattern

**Decision**: The built-in IndexedDB plugin name is `indexeddb`, factory export is `createIndexedDBStoragePlugin`, and the default mounted match pattern handles all absolute POSIX paths (`/^\/(?:.*)$/`) when the plugin is enabled.

**Rationale**: The catch-all pattern preserves existing root filesystem behavior after mounting. Using `indexeddb` as the name is descriptive and follows the plugin naming convention.

**Alternatives considered**:
- More specific path prefixes (e.g., `/fs/`) - rejected because it would break existing path assumptions
- Dynamic match based on configuration - rejected for simplicity

### Decision 2: Demo Explicit Mount

**Decision**: Demo must explicitly mount IndexedDB before `refreshFileList()` in `demo/main.ts:104`-`109`.

**Rationale**: This demonstrates the opt-in pattern and gives applications control over when/how plugins are loaded.

**Alternatives considered**:
- Auto-mount on first fs operation - rejected (defeats opt-in purpose)
- Separate initialization function - rejected (adds complexity)

### Decision 3: Behavior-Preserving Extraction

**Decision**: Use a behavior-preserving extraction, not a storage architecture rewrite.

**Rationale**: Minimize risk and preserve existing data. The existing `FileSystemDB` singleton at `src/db.ts:176` is reused without changes.

**Alternatives considered**:
- Full storage abstraction layer - rejected (too invasive)
- New IndexedDB implementation - rejected (data migration complexity)

### Decision 4: Test Strategy

**Decision**: Vitest unit tests + existing Playwright e2e.

**Rationale**: Unit tests for fast iteration on plugin lifecycle/routing; e2e for full integration verification.

**Alternatives considered**:
- Playwright only - rejected (too slow for unit-level testing)
- Vitest only - rejected (need browser e2e for IndexedDB and UI integration)

## Risks / Trade-offs

### Risk: Plugin Mount Order Sensitivity

If multiple plugins are mounted, path matching conflicts could cause unexpected behavior. The implementation includes guards at `src/fs.ts:1004` to detect and reject conflicting route registrations.

**Mitigation**: Documentation clearly states that `match` patterns should be mutually exclusive.

### Risk: IndexedDB Unavailability

In environments where IndexedDB is unavailable or fails to open, operations should fail predictably rather than silently.

**Mitigation**: Tests cover IndexedDB unavailable/open failure scenarios to ensure stable error messages.

### Trade-off: API Surface Expansion

Adding plugin APIs increases the public API surface, which means more to maintain and document.

**Mitigation**: Plugin APIs are minimal and follow existing patterns. README thoroughly documents usage.

## Migration Plan

1. **Phase 1** (Tasks 1-2): Add test infrastructure and extract IndexedDB plugin
2. **Phase 2** (Tasks 3-4): Update demo to mount explicitly, add unit tests
3. **Phase 3** (Task 5-6): Draft and finalize README guide
4. **Phase 4** (Task 7): Extend Playwright e2e coverage
5. **Phase 5**: Final verification with all 4 review agents

## Verification

Zero human intervention - all verification is agent-executed:
- Test decision: Vitest unit tests + existing Playwright e2e
- QA policy: Every task has agent-executed scenarios
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Final Verification Results

- F1. Plan Compliance Audit — oracle: PASSED
- F2. Code Quality Review — unspecified-high: PASSED
- F3. Real Manual QA — unspecified-high (+ playwright if UI): PASSED
- F4. Scope Fidelity Check — deep: PASSED
