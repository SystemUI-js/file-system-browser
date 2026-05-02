# Proposal: Root-Only Plugin Mounts

## Why

支持插件挂载到根目录，去掉所有插件嵌套挂载的支持。

Nested mounts are a breaking removal: old nested configs must error. The goal is to make root-level plugin mounting the only supported mount shape, simplifying path resolution and removing complex longest-prefix nested matching logic.

## What Changes

- Root-only mount validation in `src/fs.ts`.
- Exact root-mount routing and root listing behavior.
- Updated unit and E2E coverage for success/error paths.
- Demo/docs wording aligned to the new rule.

## Capabilities

- Reject any `mountPath` deeper than one segment.
- Keep root-mounted plugin path resolution working for descendants.
- Replace nested-mount tests with rejection tests.

## Impact

- Core resolver/validation changes in `src/fs.ts`.
- Updated test suites (`src/plugin.test.ts`, `src/memory-plugin.test.ts`, `e2e/demo.spec.ts`).
- Demo mount-path input flow updated (`demo/main.ts`, `demo/index.html`).
- Documentation updated (`README.md`).

## References

- Plan: `.sisyphus/plans/root-plugin-mounting.md`
- Learnings: `.sisyphus/notepads/root-plugin-mounting/learnings.md`
