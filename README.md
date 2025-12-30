
### 存储持久化与磁盘空间（新）

浏览器可能在空间紧张时清理站点数据。为尽量避免此情况，你可以请求“持久化存储”授权：

```ts
// Promise 方式
const persisted = await fs.promises.requestPersistentStorage();
console.log('persisted:', persisted);

// 回调方式（Node 风格 error-first）
fs.requestPersistentStorage((err, ok) => {
  if (err) {
    console.error('request persistent failed:', err);
    return;
  }
  console.log('persisted:', ok);
});
```

获取当前站点的可用/总空间（近似值，来源于 `navigator.storage.estimate()`），API 对齐 Node.js 的 `fs.diskUsage`（返回 `total`、`free`、`available`，此处 `free≈available`）：

```ts
// Promise 方式
const info = await fs.promises.diskUsage();
// { total: number, free: number, available: number }
console.log('quota:', info.total, 'free:', info.free, 'available:', info.available);

// 回调方式
fs.diskUsage((err, info) => {
  if (err) return console.error(err);
  console.log(info);
});

// BigInt 结果
const infoBig = await fs.promises.diskUsage({ bigint: true });
// { total: bigint, free: bigint, available: bigint }
```

注意：
- 这些能力依赖于浏览器的 Storage API（`navigator.storage.persisted/persist/estimate`）。在不支持的环境中，请自行做兼容处理。
- 返回值为近似估计，具体行为与配额政策由浏览器实现决定。

## 插件系统（新）

本库提供可插拔的“路径拦截”机制，便于挂载 WebDAV/各类网盘/SMB 或自定义虚拟文件。插件代码可独立于本仓库维护。

### 核心 API
- `registerPlugin(name, factory)`：注册插件工厂（仅登记，不启用）。
- `usePlugin(name, options)`：按名称实例化并启用插件；若名称未注册会抛错；同名多次启用将覆盖旧实例。
- `unregisterPlugin(name)`：停止并移除已启用的插件。

### 插件工厂签名
```ts
type FsPluginFactory<TOptions = unknown> = (
  options: TOptions,
  ctx: FsPluginContext
) => {
  match: RegExp;                    // 命中后所有相关 fs 调用将路由到插件
  handlers?: Partial<CorePromises>  // 按需覆盖，未实现的回退到内置 IndexedDB 版本
             & Partial<UtilityHandlers>;
};
```

`ctx` 提供：
- `baseFs`：内置 IndexedDB 版 `fs.promises`，可复用未覆盖的能力
- `Buffer`：`BufferPolyfill`
- `createFd(path, flags?)` / `releaseFd(fd)`：创建/释放带插件标记的 fd（供自定义 `open` 及后续 `read/write/close` 使用）
- `baseWatch` / `baseWatchFile` / `baseUnwatchFile`
- `baseCreateReadStream` / `baseCreateWriteStream`

可覆盖的方法包含所有 Promise 版 fs API（`readFile`、`writeFile`、`appendFile`、`rename`、`copyFile`、`mkdir`、`readdir`、`rm`、`unlink`、`rmdir`、`stat`、`lstat`、`readlink`、`symlink`、`link`、`exists`、`access`、`nlink`、`open`、`read`、`write`、`close`）以及工具方法 `watch`、`watchFile`、`unwatchFile`、`createReadStream`、`createWriteStream`。未实现的接口自动走内置实现。

**注意**：若一次调用涉及的多个路径匹配到不同插件，会抛出异常以避免行为不一致；请保持拦截正则互斥。

### 最小示例：虚拟云盘只读插件
```ts
import * as fs from 'fs';
import { registerPlugin, usePlugin, FsPluginContext } from '@system-ui-js/file-system-browser';

type CloudOpts = { greeting?: string };

registerPlugin<CloudOpts>('cloud', (options, ctx) => ({
  match: /^\\/cloud(\\/|$)/,
  handlers: {
    async readFile(path: string) {
      return ctx.Buffer.fromString(
        `${options?.greeting ?? 'hello'}, reading ${path}`
      );
    },
    // 未实现的 API 自动回退到 ctx.baseFs
  },
}));

usePlugin('cloud', { greeting: 'hi' });

const content = await fs.promises.readFile('/cloud/demo.txt', 'utf8');
```

## 开发

```bash
# 安装依赖
yarn install

# 启动开发服务器
yarn dev

# 构建库
yarn build

# 构建 demo
yarn build:demo

# 代码检查
yarn lint

# 代码格式化
yarn format
```

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 目录排序（新）

排序不是文件系统（fs）本身的职责，因此本库将“排序状态”独立管理，提供一个与 `fs` 并列的工具单例 `sorter`，并使用单独的 IndexedDB 表进行持久化（不会污染 `fs` 的数据库结构）。

能力概览：

- 每个目录可单独保存排序配置：`mode` ∈ `name | createdAt | modifiedAt | size | manual`，`order` ∈ `asc | desc`
- 自由排序（manual）：
  - 列表模式下：使用 `manualOrder` 按名称顺序排列
  - 图标模式下：使用 `iconPositions` 记录每个子项的摆放坐标（x,y）
- 迁移/复制项目到其他目录时，自动清理源目录对应子项的自由排序信息，并将目标目录的对应条目附加到末尾（不设置坐标，交给 UI 决定）。

导出位置：

```ts
import fs, { sorter } from '@system-ui-js/file-system-browser';
```

核心 API：

```ts
// 获取/设置目录排序配置
const cfg = await sorter.getConfig('/documents');
await sorter.setConfig('/documents', { mode: 'name', order: 'asc' });

// 应用排序（仅对传入的 entries 排序，不修改持久化）
const sorted = await sorter.applySort('/documents', entries, { view: 'list' });

// 设置自由排序
await sorter.setManualOrder('/documents', ['a.txt', 'b.txt', 'c.txt']);
await sorter.setIconPositions('/pictures', { 'a.jpg': { x: 120, y: 80 } });

// 在文件操作后调用（Demo 已示范调用时机）
await sorter.onEntriesAdded('/documents', ['new.txt']);
await sorter.onEntriesRemoved('/documents', ['old.txt']);
await sorter.onEntriesMoved('/from', '/to', ['moved.txt']);
```

类型：`DirSortConfig`, `SortMode`, `SortOrder`, `IconPosition` 也一并导出。

注意：

- `sorter` 的键默认使用“子项名称”（同一目录下唯一）。如你的 UI 使用完整路径作为唯一标识，可在接入层做转换。
- 常规排序会“目录靠前，同类比较”。自由排序时不进行目录/文件分组，由 `manualOrder`/`iconPositions` 决定顺序。
- 该模块与 `fs` 解耦。你可以在任何地方拿到目录条目后调用 `sorter.applySort()` 进行排序。
