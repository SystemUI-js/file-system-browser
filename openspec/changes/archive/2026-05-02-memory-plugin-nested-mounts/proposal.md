# Proposal: Memory Plugin and Manual Mount Demo

## Why

### Original Request
增加内存插件，文件存在内存中。demo 中不再默认挂载，而是使用者自己挂载，可以自己选择输入挂载文件夹，挂载可以嵌套。

### Background
当前 demo 在启动时自动挂载 IndexedDB 插件到 `/indexeddb`，用户无法选择其他存储后端或自定义挂载路径。为了支持更灵活的存储插件演示和测试场景，需要：
1. 提供一个内存存储插件（数据仅保存在页面会话内存中）
2. 移除 demo 的自动挂载行为，改为用户手动挂载
3. 支持用户输入任意有效的绝对挂载路径，包括嵌套路径

### Problem Statement
- 缺乏非持久化存储后端，不利于测试和临时文件操作
- demo 自动挂载限制了用户对存储后端的选择
- 无法演示嵌套挂载场景（如 `/memory/nested`）

## What Changes

### Core Changes
1. **新增内存存储插件** (`src/plugins/memory.ts`)
   - 实现 `createMemoryStoragePlugin` 工厂函数
   - 支持完整的文件系统操作（CRUD、链接、流、监控等）
   - 数据仅存储在实例内存中，无持久化

2. **重构 Demo 挂载 UX**
   - 移除启动时的默认挂载行为
   - 添加统一的手动挂载表单（插件类型选择 + 挂载路径输入）
   - 支持 memory/indexeddb/webdav 三种插件
   - 嵌套挂载路径输入（如 `/memory/nested`）

3. **测试覆盖**
   - 内存插件单元测试（CRUD、隔离性、生命周期）
   - Playwright E2E 测试（手动挂载、无效路径、嵌套挂载）

4. **文档更新**
   - README 新增内存插件使用说明
   - 更新 demo 启动行为描述

### Capabilities

- [x] 内存存储插件 API 可用（`createMemoryStoragePlugin`、`MemoryStoragePluginOptions`）
- [x] Demo 手动挂载表单（插件选择 + 路径输入 + 挂载按钮）
- [x] 嵌套挂载支持（如 `/memory` 和 `/memory/nested` 独立路由）
- [x] 挂载路径验证（拒绝空路径、相对路径、根路径、重复路径等）
- [x] 完整的单元测试覆盖（41 个测试通过）
- [x] 完整的 E2E 测试覆盖（24 个测试通过）

## Impact

### Affected Components
- `src/plugins/memory.ts`（新增）
- `src/index.ts`（导出新增）
- `src/memory-plugin.test.ts`（新增）
- `demo/index.html`（挂载表单 UI）
- `demo/main.ts`（移除自动挂载，添加手动挂载逻辑）
- `e2e/demo.spec.ts`（更新 E2E 测试）
- `README.md`（文档更新）

### Backward Compatibility
- 现有 IndexedDB 插件行为不变
- 核心路由逻辑不变（最长前缀匹配已支持嵌套挂载）
- 无数据迁移需求

### Performance Considerations
- 内存插件数据在页面刷新后丢失（符合设计预期）
- 实例本地状态，无全局单例，支持多个独立挂载点
