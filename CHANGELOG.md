# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2025-12-30

### Fixed
- 修复了 25 个 ESLint 错误和警告，包括：
  - 移除了所有 `any` 类型的使用，改用 `unknown` 或更精确的类型
  - 修复了 Prettier 格式问题
- 修复了 demo/main.ts 中的类型错误
- 修复了 src/db.ts 中的类型断言问题
- 修复了 src/fs.ts 中的类型安全问题
- 修复了 src/sort-db.ts 中的类型定义
- 修复了 e2e/demo.spec.ts 中的格式和测试逻辑问题

### Added
- 添加了完整的单元测试套件：
  - src/db.test.ts (40+ 测试用例)
  - src/fs.test.ts (40+ 测试用例)
  - src/sort-db.test.ts (40+ 测试用例)
- 添加了 Vitest 测试框架配置
- 添加了测试覆盖率报告支持
- 添加了 @vitest/ui 和 @vitest/coverage-v8 依赖
- 新增 E2E 测试用例，验证文件操作按钮和控件显示

### Changed
- 更新了 package.json，添加了测试相关脚本：
  - `test`: 运行 Vitest 测试
  - `test:run`: 一次性运行所有测试
  - `test:coverage`: 运行测试并生成覆盖率报告
- 改进了测试状态验证逻辑
- 优化了错误处理和类型安全

### Test Results
- 单元测试：40 个测试全部通过
- E2E 测试：3 个测试全部通过
- 项目构建：成功
- ESLint 检查：通过

## [0.1.0] - 2025-12-29

### Added
- 初始版本发布
- 支持 WebDAV 风格的浏览器文件系统接口
- 基于 IndexedDB 的浏览器文件存储
- 插件系统支持
- 文件上传和持久化功能
- Playwright E2E 测试框架集成
