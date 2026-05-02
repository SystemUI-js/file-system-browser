# 浏览器文件系统（File System Browser）

一个在浏览器中使用 IndexedDB 实现的“类 Node.js `fs` / 类 WebDAV”文件系统接口，适用于离线文件存储、文件管理器、虚拟文件系统等场景。

## 核心特性

- IndexedDB 持久化：文件/目录数据存放在浏览器本地（可离线）
- Node.js 风格 API：同时提供 `fs.promises` 与回调（error-first）两种用法
- 基础文件能力：读写、追加、复制、重命名、删除、遍历目录等
- 链接能力：支持软链接（`symlink/readlink`）与硬链接（`link/nlink`）
- 文件描述符：支持 `open/read/write/close`
- 监控与流：提供 `watch/watchFile` 与 `createReadStream/createWriteStream`（best-effort）
- 存储增强：`requestPersistentStorage()` 与 `diskUsage()`（对齐 Node 的 `fs.diskUsage`）
- 可插拔插件：路径拦截机制，可挂载 WebDAV/网盘/SMB 或自定义虚拟文件
- 目录排序：独立单例 `sorter` 管理排序状态（单独 IndexedDB 表持久化）

## 演示

本仓库内置一个简单的文件管理 Demo（上传/下载、目录创建、复制/剪切/粘贴、软链接/硬链接、排序等）。

```bash
yarn install
yarn dev
```

然后打开 `http://localhost:9973`。

### 演示中的挂载点

Demo 启动时**不会自动挂载任何存储插件**。你需要在界面中手动选择插件类型并输入挂载路径：

- **内存**：选择 `memory` 插件，输入路径如 `/memory`，点击“挂载”。数据仅保存在当前页面会话的内存中，刷新页面后会丢失。
- **IndexedDB**：选择 `indexeddb` 插件，输入路径如 `/indexeddb`，点击“挂载”。数据持久化在浏览器 IndexedDB 中。
- **WebDAV**：选择 `webdav` 插件，输入路径如 `/webdav`，填写服务器 URL 等信息后点击“挂载”。WebDAV 配置仅保存在内存中，刷新页面后需重新配置。

也支持嵌套挂载，例如先在 `/memory` 挂载内存插件，再在其子路径 `/memory/nested` 挂载另一个内存插件，两个路径的数据相互隔离。

构建 Demo（用于静态部署）：

```bash
yarn build:demo
```

产物输出到 `dist-demo/`。

## 安装

```bash
# 推荐：yarn
yarn add @system-ui-js/file-system-browser

# npm
npm i @system-ui-js/file-system-browser
```

## 快速开始

### Promise 用法（推荐）

```ts
import fs from '@system-ui-js/file-system-browser';

await fs.promises.mkdir('/documents', { recursive: true });
await fs.promises.writeFile('/documents/hello.txt', 'hello', 'utf8');

const text = await fs.promises.readFile('/documents/hello.txt', 'utf8');
console.log(text); // "hello"
```

### 回调用法（Node error-first）

```ts
import fs from '@system-ui-js/file-system-browser';

fs.writeFile('/a.txt', 'hi', 'utf8', (err) => {
  if (err) return console.error(err);
  fs.readFile('/a.txt', 'utf8', (readErr, content) => {
    if (readErr) return console.error(readErr);
    console.log(content);
  });
});
```

### 读取目录（Dirent）

```ts
import fs from '@system-ui-js/file-system-browser';

const dirents = await fs.promises.readdir('/', { withFileTypes: true });
for (const d of dirents) {
  console.log(d.name, d.isDirectory() ? 'dir' : 'file');
}
```

### 软链接与硬链接

```ts
import fs from '@system-ui-js/file-system-browser';

await fs.promises.writeFile('/src.txt', 'data', 'utf8');

// 软链接：链接本身是一个独立条目（lstat 可区分），stat 会跟随到目标
await fs.promises.symlink('/src.txt', '/sym.txt');
console.log(await fs.promises.readlink('/sym.txt')); // "/src.txt"

// 硬链接：多个路径指向同一份内容，写入会同步到同组内其他硬链接
await fs.promises.link('/src.txt', '/hard.txt');
console.log(await fs.promises.nlink('/src.txt')); // 2
```

### 文件描述符（open/read/write/close）

```ts
import fs from '@system-ui-js/file-system-browser';

const h = await fs.promises.open('/fd.txt', 'w');
await h.write('hello');
await h.close();

const fd = await fs.open('/fd.txt', 'r');
const buf = new Uint8Array(5);
const { bytesRead } = await fs.promises.read(fd, buf, 0, buf.length, 0);
console.log(bytesRead, new TextDecoder().decode(buf));
await fs.close(fd);
```

### 流（createReadStream/createWriteStream）

```ts
import fs, { Buffer } from '@system-ui-js/file-system-browser';

const ws = fs.createWriteStream('/stream.txt');
ws.on('finish', () => console.log('write finished'));
ws.on('error', (e) => console.error('write error', e));
await ws.write('part1-');
await ws.end('part2');

const rs = fs.createReadStream('/stream.txt', { highWaterMark: 4 });
rs.on('data', (chunk: Buffer) => console.log('chunk:', chunk.toString()));
rs.on('end', () => console.log('read end'));
rs.on('error', (e) => console.error('read error', e));
```

### 监控（watch/watchFile）

```ts
import fs from '@system-ui-js/file-system-browser';

const watcher = fs.watch('/watched.txt', (eventType, filename) => {
  console.log(eventType, filename);
});

fs.watchFile('/watched.txt', (curr, prev) => {
  console.log('changed:', prev.size, '->', curr.size);
});

await fs.promises.writeFile('/watched.txt', 'data', 'utf8');

watcher.close();
fs.unwatchFile('/watched.txt');
```

## API 速查

- 默认导出：`fs`
- 命名导出：`Dirent`、`Stats`、`Buffer`、`registerPlugin/usePlugin/unregisterPlugin`、`sorter`
- `fs.promises`：Promise 版 API（推荐使用）
- `fs.*`：回调版包装（也支持直接返回 Promise）

说明：本库同时提供 `readFileSync/writeFileSync/...` 等带 `Sync` 后缀的方法名，但它们依旧是异步实现（返回 Promise 或接收回调），用于降低从 Node 迁移的心智负担。

## 存储持久化与磁盘空间

浏览器可能在空间紧张时清理站点数据。为尽量避免此情况，你可以请求“持久化存储”授权：

```ts
import fs from '@system-ui-js/file-system-browser';

// Promise 方式
const persisted = await fs.promises.requestPersistentStorage();
console.log('persisted:', persisted);

// 回调方式（Node 风格 error-first）
fs.requestPersistentStorage((err, ok) => {
  if (err) return console.error('request persistent failed:', err);
  console.log('persisted:', ok);
});
```

获取当前站点的可用/总空间（近似值，来源于 `navigator.storage.estimate()`），API 对齐 Node.js 的 `fs.diskUsage`（返回 `total`、`free`、`available`，此处 `free≈available`）：

```ts
import fs from '@system-ui-js/file-system-browser';

// Promise 方式
const info = await fs.promises.diskUsage();
console.log('total:', info.total, 'free:', info.free, 'available:', info.available);

// 回调方式
fs.diskUsage((err, data) => {
  if (err) return console.error(err);
  console.log(data);
});

// BigInt 结果
const infoBig = await fs.promises.diskUsage({ bigint: true });
// { total: bigint, free: bigint, available: bigint }
```

注意：
- 这些能力依赖于浏览器的 Storage API（`navigator.storage.persisted/persist/estimate`）。在不支持的环境中请自行做兼容处理。
- 返回值为近似估计，具体行为与配额政策由浏览器实现决定。

## 插件系统

### 插件系统概览
本库提供可插拔的"路径拦截"机制，便于挂载 WebDAV/各类网盘/SMB 或自定义虚拟文件。插件代码可独立于本仓库维护。

核心思想：每个插件可以声明一个 `mountPath`（挂载路径）或 `match`（正则表达式），匹配到的路径由该插件处理。插件不修改内置数据库，只负责特定路径前缀下的读写逻辑。如果某个已匹配插件没有实现特定的 API，调用将抛出错误，不会自动回退到其他存储后端。

#### `mountPath` 与虚拟根
推荐使用 `mountPath` 来指定插件的挂载点，例如 `mountPath: '/webdav'` 表示该插件负责 `/webdav` 及其子路径。系统使用**最长前缀匹配**原则：当多个插件可能匹配同一路径时，路径前缀最长的插件优先。

```ts
usePlugin('webdav', { mountPath: '/webdav', baseUrl: 'https://example.com/dav' });
usePlugin('indexeddb', { mountPath: '/indexeddb' });
```

- `/webdav/docs` → 由 WebDAV 插件处理
- `/indexeddb/docs` → 由 IndexedDB 插件处理
- `/other` → 回退到默认 IndexedDB 实现（或 catch-all 插件）

#### 跨挂载点操作限制
涉及多个路径的操作（`rename`、`copyFile`、`link`）要求源路径和目标路径必须**在同一个挂载点**内。如果跨挂载点操作，会抛出异常。

#### 向后兼容：正则匹配
旧版插件使用 `match` 正则表达式声明拦截范围，仍然完全支持。`mountPath` 是更简洁的替代方案。 catch-all 插件（如 `match: /^\//`）可以继续正常工作。

### 为什么插件是可选的
主包不会自动挂载任何存储插件——你需要显式注册并启用插件后才生效。这避免了隐式依赖，也让你完全掌控要引入哪些存储后端。按需加载也便于 tree-shaking。

### 生命周期 API

插件有三个状态：注册（工厂函数登记）、启用（实例化并挂载）、注销（卸载并移除）：

- `registerPlugin(name, factory)`：注册插件工厂（仅登记，不启用）。`factory` 是 `FsPluginFactory<T>` 类型的函数。
- `usePlugin(name, options?)`：按名称实例化并启用插件；若名称未注册会抛错；同名多次启用将覆盖旧实例。`options` 会透传给工厂函数的第一个参数。
- `unregisterPlugin(name)`：停止并移除已启用的插件。

```ts
import { registerPlugin, usePlugin, unregisterPlugin } from '@system-ui-js/file-system-browser';

// 注册（仅登记）
registerPlugin('myfs', myFactory);

// 启用
usePlugin('myfs', { /* 透传给工厂的选项 */ });

// 注销
unregisterPlugin('myfs');
```

### 工厂与上下文契约

`FsPluginFactory<TOptions>` 签名：

```ts
type FsPluginFactory<TOptions> = (
  options: TOptions,
  ctx: FsPluginContext
) => FsPluginInstance;
```

`FsPluginContext` 提供以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `baseFs` | `FsPromises` | 内置 IndexedDB 版 `fs.promises`，用于委托未实现的操作 |
| `Buffer` | `BufferPolyfill` | 与本库导出的 `Buffer` 相同，用于数据转换 |
| `createFd(path, flags?)` | `(path, flags?) => Promise<number>` | 创建带插件标记的文件描述符 |
| `releaseFd(fd)` | `(fd: number) => Promise<void>` | 释放文件描述符 |
| `baseWatch` | `(path, listener) => Watcher` | 内置 watch 实现 |
| `baseWatchFile` | `(path, listener) => void` | 内置 watchFile 实现 |
| `baseUnwatchFile` | `(path) => void` | 内置 unwatchFile 实现 |
| `baseCreateReadStream` | `(path, options?) => ReadStream` | 内置流实现 |
| `baseCreateWriteStream` | `(path, options?) => WriteStream` | 内置流实现 |

`FsPluginInstance` 结构：

```ts
interface FsPluginInstance {
  match: RegExp;          // 拦截路径正则，如 /^\/cloud(\/|$)/
  handlers: Partial<FsHandlers>;  // 可选实现的方法集合
}
```

`handlers` 中未实现的 API 自动走 `ctx.baseFs`，因此只需实现想要自定义的部分。

### 路径匹配与冲突规则

#### `mountPath` 匹配（推荐）
使用 `mountPath` 时，插件会自动拦截该路径及其所有子路径：

```ts
usePlugin('cloud', { mountPath: '/cloud' });
// 匹配 /cloud 和 /cloud/xxx
```

系统按**最长前缀优先**原则选择插件。例如 `/cloud/docs` 会优先匹配 `mountPath: '/cloud/docs'` 而非 `mountPath: '/cloud'`。

#### `match` 正则匹配（向后兼容）
旧版插件使用 `match` 正则表达式声明拦截范围，仍然完全支持。建议格式为 `^\/前缀(\/|$)`，确保：
- `^` 锚定开头，防止误匹配其他路径
- `(\/|$)` 结尾确保精确匹配该路径本身，或其子路径

```ts
match: /^\/cloud(\/|$)/  // 匹配 /cloud 和 /cloud/xxx
```

**冲突规则**：一次 fs 调用涉及的多个路径如果匹配到不同插件，会抛出异常以避免行为不一致。因此：
- 不同插件的挂载点（`mountPath` 或 `match`）应保持互斥，避免重叠
- 若需要组合多个后端，在同一插件内部做分发

### IndexedDB 存储插件

本库提供了一个可选的 `indexeddb` 插件，开箱即用地将路径映射到内置 IndexedDB 存储（与默认行为完全一致）。这在你需要统一通过插件机制管理所有存储后端时有用。

#### 方式一：Catch-all 模式（传统方式，兼容旧代码）

```ts
import {
  registerPlugin,
  usePlugin,
  createIndexedDBStoragePlugin,
} from '@system-ui-js/file-system-browser';

registerPlugin('indexeddb', createIndexedDBStoragePlugin);
usePlugin('indexeddb', {});
// 之后所有 fs 操作走默认 IndexedDB 实现
```

#### 方式二：挂载到指定路径（推荐用于多后端共存）

```ts
import {
  registerPlugin,
  usePlugin,
  createIndexedDBStoragePlugin,
} from '@system-ui-js/file-system-browser';

registerPlugin('indexeddb', createIndexedDBStoragePlugin);
usePlugin('indexeddb', { mountPath: '/indexeddb' });
// 只有 /indexeddb 及其子路径走此插件，其他路径可挂载其他后端
```

注意：主包不会自动挂载 IndexedDB 插件。你需要在应用初始化时显式注册并启用它。

### 内存存储插件

本库提供内存插件，可将数据临时存储在页面内存中（非持久化）。适用于临时文件操作、测试场景或不需要持久化的数据。

```ts
import {
  registerPlugin,
  usePlugin,
  createMemoryStoragePlugin,
} from '@system-ui-js/file-system-browser';

registerPlugin('memory', createMemoryStoragePlugin);
usePlugin('memory', { mountPath: '/memory' });

await fs.promises.writeFile('/memory/temp.txt', 'hello', 'utf8');
const content = await fs.promises.readFile('/memory/temp.txt', 'utf8');
console.log(content); // "hello"
```

注意：内存插件的数据仅保存在当前页面会话中。刷新页面、关闭标签页或注销插件后，数据会丢失。如需持久化，请使用 IndexedDB 插件。

### WebDAV 存储插件

本库提供 WebDAV 插件，可将远程 WebDAV 服务器挂载到本地路径。

```ts
import {
  registerPlugin,
  usePlugin,
  createWebDAVStoragePlugin,
} from '@system-ui-js/file-system-browser';

registerPlugin('webdav', createWebDAVStoragePlugin);
usePlugin('webdav', {
  mountPath: '/webdav',
  baseUrl: 'https://example.com/dav',
  // 认证信息通过 username/password 或 token 传入
  // headers: { 'X-Custom-Header': 'value' },
});
```

`WebDAVStoragePluginOptions`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `baseUrl` | `string` | WebDAV 服务器地址（必填） |
| `mountPath` | `string` | 本地挂载路径，默认 `/webdav` |
| `remoteRoot` | `string` | 远程根路径，默认 `/` |
| `username` | `string` | 基本认证用户名 |
| `password` | `string` | 基本认证密码 |
| `token` | `string` | Bearer Token |
| `headers` | `Record<string, string>` | 自定义请求头 |
| `fetch` | `typeof fetch` | 自定义 fetch 实现 |

#### 重要限制

- **CORS**：WebDAV 请求受浏览器同源策略限制。CORS 必须在**服务器端**配置，无法通过客户端代码绕过。如果服务器未配置 CORS，浏览器会拦截请求。
- **不支持的 API**：浏览器环境下无法使用 `watch`、`watchFile`、`unwatchFile`、`createReadStream`、`createWriteStream`，也不支持 `symlink`、`readlink`、`link`（硬链接）、`nlink`、文件描述符（`open/read/write/close`）。
- **内存限制**：文件内容在传输过程中会暂存于内存，超大文件可能导致内存不足。

安全提示：不要在代码或 localStorage 中硬编码密码。建议通过安全方式获取凭据（如用户输入、OAuth 等）。

### 自定义插件示例

**最小示例：虚拟云盘只读插件**

```ts
import fs, { registerPlugin, usePlugin } from '@system-ui-js/file-system-browser';

type CloudOpts = { greeting?: string };

registerPlugin<CloudOpts>('cloud', (options, ctx) => ({
  match: /^\/cloud(\/|$)/,
  handlers: {
    async readFile(path: string) {
      return ctx.Buffer.fromString(
        `${options?.greeting ?? 'hello'}, reading ${path}`
      );
    },
  },
}));

usePlugin('cloud', { greeting: 'hi' });

const content = await fs.promises.readFile('/cloud/demo.txt', 'utf8');
console.log(content); // "hi, reading /cloud/demo.txt"
```

**完整读写插件示例**

下面实现一个读写都支持的插件，演示如何委托未实现的操作给 `baseFs`：

```ts
import fs, { registerPlugin, usePlugin, type FsPluginContext, type FsHandlers } from '@system-ui-js/file-system-browser';

type MyFSOpts = { root: string };

const myFSFactory = (options: MyFSOpts, ctx: FsPluginContext): FsHandlers => ({
  match: /^\/myfs(\/|$)/,
  handlers: {
    async readFile(path: string, encoding?: BufferEncoding) {
      // 自定义实现：假设从远程获取
      const data = await fetchFromRemote(options.root + path);
      return ctx.Buffer.from(data);
    },
    async writeFile(path: string, data: Uint8Array, encoding?: BufferEncoding) {
      // 自定义实现
      await uploadToRemote(options.root + path, data);
    },
    async readdir(path: string, opts?: { withFileTypes?: boolean }) {
      // 委托给内置实现（如果插件只实现部分 API）
      return ctx.baseFs.readdir(path, opts);
    },
    // 可按需继续实现 stat/mkdir/rm/rename 等
  },
});

registerPlugin<MyFSOpts>('myfs', myFSFactory);
usePlugin('myfs', { root: 'https://my-storage.example.com' });
```

实现插件时注意：
- `ctx.Buffer` 与 Node.js 的 `Buffer` API 兼容（`fromString`/`from`/`alloc` 等）
- 文件描述符操作需要 `createFd`/`releaseFd` 配合，参考 Demo 中的 `open`/`read`/`write`/`close` 实现
- `watch`/`createReadStream` 等流式 API 类似，按需实现或回退到 `baseWatch`/`baseCreateReadStream`

### 测试与调试

插件代码推荐在隔离环境中测试，确保路径匹配、handler 调用、错误处理都符合预期：

```ts
import { registerPlugin, usePlugin, unregisterPlugin } from '@system-ui-js/file-system-browser';
// Vitest 示例（使用 fake-indexeddb 提供浏览器环境）

// 注册测试插件
registerPlugin('test', (opts, ctx) => ({
  match: /^\/test-plugin(\/|$)/,
  handlers: {
    async readFile() {
      return ctx.Buffer.fromString('mock content');
    },
  },
}));

usePlugin('test');

// 验证
const content = await fs.promises.readFile('/test-plugin/file.txt', 'utf8');
expect(content).toBe('mock content');

// 清理
unregisterPlugin('test');
```

常见测试场景：
- 插件注册/启用/注销生命周期
- `match` 正则对各类路径的匹配行为
- handler 返回值类型是否正确（`Uint8Array`）
- 未实现 API 是否正确回退到 `baseFs`
- 多插件冲突场景是否抛出异常
- 错误情况（路径不匹配、插件未注册等）

### 迁移说明

本库的插件系统设计为向后兼容：
- 现有数据（文件、目录、链接等）保留在 `FileSystemDB` 中，不受插件影响
- 插件仅决定路径的读写逻辑，不迁移底层数据格式
- 若从无插件切换到有插件场景，原有数据依然可通过默认路径访问

### 排序持久化说明

排序使用独立的 `FileSystemSortDB`，与插件系统完全解耦：
- 插件启用/禁用不会影响已有的排序配置
- 排序数据存储在不同 IndexedDB 表，不污染插件的数据空间
- 插件可自行读写 `sorter` 来管理排序状态（如需要）

## 目录排序

排序不是文件系统（`fs`）本身的职责，因此本库将“排序状态”独立管理，提供一个与 `fs` 并列的工具单例 `sorter`，并使用单独的 IndexedDB 表进行持久化（不会污染 `fs` 的数据库结构）。

能力概览：

- 每个目录可单独保存排序配置：`mode` ∈ `name | createdAt | modifiedAt | size | manual`，`order` ∈ `asc | desc`
- 自由排序（manual）
  - 列表模式：使用 `manualOrder` 按名称顺序排列
  - 图标模式：使用 `iconPositions` 记录每个子项的摆放坐标（x,y）
- 迁移/复制到其他目录时：自动清理源目录对应子项的自由排序信息，并将目标目录的对应条目附加到末尾（不设置坐标，交给 UI 决定）。

```ts
import { sorter } from '@system-ui-js/file-system-browser';

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

类型：`DirSortConfig`、`SortMode`、`SortOrder`、`IconPosition` 也一并导出。

注意：
- `sorter` 的键默认使用“子项名称”（同一目录下唯一）。如你的 UI 使用完整路径作为唯一标识，可在接入层做转换。
- 常规排序会“目录靠前，同类比较”。自由排序时不进行目录/文件分组，由 `manualOrder/iconPositions` 决定顺序。
- 该模块与 `fs` 解耦。你可以在任何地方拿到目录条目后调用 `sorter.applySort()` 进行排序。

## 开发

```bash
# 安装依赖
yarn install

# 启动开发服务器（Demo）
yarn dev

# 构建库
yarn build

# 构建 Demo
yarn build:demo

# 代码检查
yarn lint

# 代码格式化
yarn format

# 单元测试
yarn test:unit -- --run

# 端到端测试（Playwright）
yarn test:e2e
```

## 兼容性与注意事项

- 本库面向浏览器环境（依赖 `indexedDB`）；不同浏览器的存储配额与清理策略不同，建议配合 `requestPersistentStorage()`。
- 路径使用 POSIX 风格：会自动补全开头 `/`，并去掉末尾多余的 `/`（根目录 `/` 除外）。
- 编码支持为子集：`readFile/writeFile/appendFile` 的字符串编码目前主要支持 `utf8/utf-8` 与 `base64`，其他编码会抛出错误。
- 流与监控为 best-effort 实现：`createWriteStream` 在内存中累积数据，`end()` 时一次性落盘；`watch/watchFile` 为进程内事件分发，并且仅监听“精确路径”（不会像真实文件系统那样自动监听目录下的子项变更）。
- 未实现的 Node API（如 `realpath/chmod/chown/cp/mkdtemp` 等）会抛出不支持错误。
- 数据落盘位置：IndexedDB 数据库名为 `FileSystemDB`；目录排序数据库名为 `FileSystemSortDB`。

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
