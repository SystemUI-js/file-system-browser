# Design: Memory Plugin and Manual Mount Demo

## Context

### Project Background
本项目是一个浏览器文件系统库，基于 IndexedDB 实现类 Node.js `fs` API。为了支持更灵活的存储后端和演示场景，需要增加内存存储插件并改进 demo 的挂载体验。

### Key Learnings
- `virtualRootReaddir` 在 `src/fs.ts` 中会将挂载根目录注入到 `readdir('/')` 结果中，因此挂载点会从根目录可见
- 不同 `mountPath` 的同名插件可以共存（系统只替换同名且同路径的插件实例）
- 嵌套挂载点不会出现在父目录的 `readdir` 列表中，需要通过返回按钮或直接 API 调用导航
- `refreshFileList()` 会异步读取排序配置并更新 UI 控件，可能导致与测试的竞态条件

## Goals

### Must Achieve
1. 提供第一方内存存储插件，数据仅保存在实例内存中
2. Demo 启动时不自动挂载任何存储插件
3. 用户可以通过统一表单手动选择插件类型并输入挂载路径
4. 支持嵌套挂载路径（如 `/memory/nested`）
5. 所有变更通过单元测试和 E2E 测试验证

### Non-Goals
- 不将内存数据持久化到 IndexedDB、localStorage 或 Cache API
- 不改变核心路由解析器行为（除非测试证明存在缺陷）
- 不添加 CI 工作流变更
- 不创建通用的插件管理抽象
- 不进行大范围 UI 重设计

## Decisions

### Architecture Decisions

| Decision | Choice | Rationale | Alternatives Rejected |
|---|---|---|---|
| 内存存储后端 | 实例本地 `Map<string, FileEntry>` | 隔离性最好，支持多挂载点，无全局状态 | 全局单例（ rejected：无法支持多个独立挂载点） |
| 数据克隆策略 | 写入时复制输入字节到新 `ArrayBuffer` | 防止调用者修改影响存储数据 | 直接引用（ rejected：数据可能被外部修改） |
| FD 实现 | 调用 `ctx.createFd` + 插件本地位置状态 | 与核心 FD 系统集成，支持 `releaseFd` 清理 | 独立 FD 计数器（ rejected：与核心系统不兼容） |
| Demo 挂载 UX | 统一表单（选择器 + 路径输入 + 条件 WebDAV 字段） | 简洁，减少 UI 复杂度 | 每个插件独立表单（ rejected：UI 冗余） |
| 根路径写入 | 直接返回 `/${name}`，不再重写为 `/indexeddb` | 符合用户预期，支持多插件 | 保持 `/indexeddb` 重写（ rejected：与手动挂载设计冲突） |

### Testing Decisions
- **TDD 策略**：先添加失败的测试期望，再实现功能
- **单元测试**：Vitest + fake-indexeddb，覆盖所有 handler
- **E2E 测试**：Playwright，覆盖 UI 交互和端到端场景

## Risks / Trade-offs

### Identified Risks
1. **竞态条件**：`refreshFileList()` 与测试的并发 select 修改可能导致排序控件被覆盖
   - 缓解：在相关测试中添加适当的等待时间
2. **HTTP 代理干扰**：`http_proxy` 环境变量可能干扰 Playwright 的 localhost 连接
   - 缓解：测试时使用 `NO_PROXY=localhost,127.0.0.1`
3. **内存数据丢失**：页面刷新后内存插件数据丢失（符合设计，但需文档明确说明）

### Trade-offs
- **内存 vs 持久化**：选择非持久化以简化实现和测试，但限制了使用场景
- **最长前缀路由 vs 特殊嵌套处理**：依赖现有核心路由，不添加特殊处理，降低复杂度但要求用户理解路由行为

## Migration Plan

### 对于库用户
1. 如需使用内存插件：
   ```ts
   import { registerPlugin, usePlugin, createMemoryStoragePlugin } from '@system-ui-js/file-system-browser';
   registerPlugin('memory', createMemoryStoragePlugin);
   usePlugin('memory', { mountPath: '/memory' });
   ```

2. 如需更新 demo：
   - 启动后手动选择插件类型
   - 输入挂载路径（如 `/memory`）
   - 点击挂载按钮

### 对于开发者
- 所有现有测试和构建命令保持不变
- 新增 `src/memory-plugin.test.ts` 测试文件
