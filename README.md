# 浏览器文件系统（File System Browser）

一个在浏览器中使用 IndexedDB 实现的"类 Node.js `fs` / 类 WebDAV"文件系统接口，适用于离线文件存储、文件管理器、虚拟文件系统等场景。

## 核心特性

- **IndexedDB 持久化**：文件/目录数据存放在浏览器本地（可离线）
- **Node.js 风格 API**：同时提供 `fs.promises` 与回调（error-first）两种用法
- **基础文件能力**：读写、追加、复制、重命名、删除、遍历目录等
- **链接能力**：支持软链接（`symlink/readlink`）与硬链接（`link/nlink`）
- **文件描述符**：支持 `open/read/write/close`
- **监控与流**：提供 `watch/watchFile` 与 `createReadStream/createWriteStream`（best-effort）
- **存储增强**：`requestPersistentStorage()` 与 `diskUsage()`（对齐 Node 的 `fs.diskUsage`）
- **可插拔插件**：路径拦截机制，可挂载 WebDAV/网盘/SMB 或自定义虚拟文件
- **目录排序**：独立单例 `sorter` 管理排序状态（单独 IndexedDB 表持久化）

## 演示

本仓库内置一个简单的文件管理 Demo（上传/下载、目录创建、复制/剪切/粘贴、软链接/硬链接、排序等）。

```bash
yarn install
yarn dev
```

然后打开 `http://localhost:9973`。

### 演示中的挂载点

Demo 启动时**不会自动挂载任何存储插件**。你需要在界面中手动选择插件类型并输入挂载路径：

- **内存**：选择 `memory` 插件，输入路径如 `/` 或 `/memory`，点击"挂载"。数据仅保存在当前页面会话的内存中，刷新页面后会丢失。
- **IndexedDB**：选择 `indexeddb` 插件，输入路径如 `/` 或 `/indexeddb`，点击"挂载"。数据持久化在浏览器 IndexedDB 中。
- **WebDAV**：选择 `webdav` 插件，输入路径如 `/` 或 `/webdav`，填写服务器 URL 等信息后点击"挂载"。WebDAV 配置仅保存在内存中，刷新页面后需重新配置。

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

## 主系统使用指南

主系统（`fs`）是本库的核心，提供了一套完整的浏览器端文件系统 API。无论你使用何种存储后端（IndexedDB、内存或插件），这些 API 的使用方式都是一致的。

### 初始化

本库在首次调用时会自动初始化 IndexedDB 数据库并创建根目录 `/`，通常情况下你无需手动处理初始化：

```ts
import fs from '@system-ui-js/file-system-browser';

// 第一次调用任意 API 时自动初始化
await fs.promises.mkdir('/mydir');
```

### 文件操作（CRUD）

#### 创建与写入文件

```ts
import fs from '@system-ui-js/file-system-browser';

// 写入文本文件（自动创建父目录不存在时会报错，除非先 mkdir）
await fs.promises.writeFile('/notes.txt', 'Hello, World!', 'utf8');

// 写入二进制数据
const binaryData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
await fs.promises.writeFile('/image.png', binaryData);

// 追加内容到文件末尾
await fs.promises.appendFile('/log.txt', '\nNew log entry', 'utf8');
```

#### 读取文件

```ts
import fs from '@system-ui-js/file-system-browser';

// 读取为字符串
const text = await fs.promises.readFile('/notes.txt', 'utf8');

// 读取为 Buffer（Uint8Array）
const buffer = await fs.promises.readFile('/image.png');
console.log(buffer.length); // 文件字节数

// 读取为 base64
const base64 = await fs.promises.readFile('/image.png', 'base64');
```

#### 复制与移动

```ts
import fs from '@system-ui-js/file-system-browser';

// 复制文件
await fs.promises.copyFile('/notes.txt', '/notes-backup.txt');

// 重命名/移动文件
await fs.promises.rename('/notes.txt', '/documents/notes.txt');
```

#### 删除文件

```ts
import fs from '@system-ui-js/file-system-browser';

// 删除单个文件
await fs.promises.unlink('/notes.txt');

// 或使用 rm（支持文件和目录）
await fs.promises.rm('/notes.txt');

// 强制删除（不存在时不报错）
await fs.promises.rm('/maybe-exists.txt', { force: true });
```

### 目录操作

#### 创建目录

```ts
import fs from '@system-ui-js/file-system-browser';

// 创建单级目录
await fs.promises.mkdir('/documents');

// 递归创建多级目录（类似 mkdir -p）
await fs.promises.mkdir('/documents/projects/2024', { recursive: true });
```

#### 读取目录

```ts
import fs from '@system-ui-js/file-system-browser';

// 获取文件名列表
const files = await fs.promises.readdir('/documents');
console.log(files); // ['notes.txt', 'projects']

// 获取带类型信息的条目（推荐）
const dirents = await fs.promises.readdir('/documents', { withFileTypes: true });
for (const entry of dirents) {
  if (entry.isDirectory()) {
    console.log(`[DIR]  ${entry.name}`);
  } else if (entry.isFile()) {
    console.log(`[FILE] ${entry.name}`);
  } else if (entry.isSymbolicLink()) {
    console.log(`[LINK] ${entry.name}`);
  }
}
```

#### 删除目录

```ts
import fs from '@system-ui-js/file-system-browser';

// 删除空目录
await fs.promises.rmdir('/documents/empty-dir');

// 递归删除目录及其内容（危险操作！）
await fs.promises.rm('/documents', { recursive: true });
```

### 文件信息查询

```ts
import fs from '@system-ui-js/file-system-browser';

// 检查文件是否存在
const exists = await fs.promises.exists('/notes.txt');

// 检查访问权限（浏览器环境中基本始终可访问）
try {
  await fs.promises.access('/notes.txt', fs.constants.R_OK | fs.constants.W_OK);
  console.log('可读可写');
} catch {
  console.log('无法访问');
}

// 获取文件状态
const stats = await fs.promises.stat('/notes.txt');
console.log({
  size: stats.size,           // 文件大小（字节）
  isFile: stats.isFile(),     // 是否是文件
  isDirectory: stats.isDirectory(), // 是否是目录
  modifiedAt: stats.mtimeMs,  // 最后修改时间戳
  createdAt: stats.birthtimeMs, // 创建时间戳
});

// 获取链接本身的信息（不跟随软链接）
const lstats = await fs.promises.lstat('/link-to-notes.txt');
```

### 链接与快捷方式

#### 软链接（Symbolic Link）

软链接是一个独立的文件系统条目，指向另一个路径。删除软链接不会影响目标文件：

```ts
import fs from '@system-ui-js/file-system-browser';

// 创建软链接：/shortcut.txt 指向 /documents/notes.txt
await fs.promises.writeFile('/documents/notes.txt', 'important data', 'utf8');
await fs.promises.symlink('/documents/notes.txt', '/shortcut.txt');

// 读取软链接指向的目标路径
const target = await fs.promises.readlink('/shortcut.txt');
console.log(target); // "/documents/notes.txt"

// 通过软链接读取目标文件内容（自动跟随）
const content = await fs.promises.readFile('/shortcut.txt', 'utf8');
console.log(content); // "important data"

// 删除软链接（不影响目标文件）
await fs.promises.unlink('/shortcut.txt');
```

#### 硬链接（Hard Link）

硬链接让多个路径指向同一份底层数据。修改任意一个硬链接，其他硬链接看到的内容也会同步变化：

```ts
import fs from '@system-ui-js/file-system-browser';

// 创建硬链接
await fs.promises.writeFile('/original.txt', 'version 1', 'utf8');
await fs.promises.link('/original.txt', '/mirror.txt');

// 查看硬链接数量
const count = await fs.promises.nlink('/original.txt');
console.log(count); // 2

// 修改 mirror.txt，original.txt 也会变化
await fs.promises.writeFile('/mirror.txt', 'version 2', 'utf8');
const content = await fs.promises.readFile('/original.txt', 'utf8');
console.log(content); // "version 2"

// 删除其中一个硬链接，数据仍然保留（直到所有硬链接都被删除）
await fs.promises.unlink('/original.txt');
const stillThere = await fs.promises.readFile('/mirror.txt', 'utf8');
console.log(stillThere); // "version 2"
```

### 文件描述符

对于需要精细控制读写位置的场景，可以使用文件描述符：

```ts
import fs from '@system-ui-js/file-system-browser';

// 以写入模式打开（不存在则创建，存在则清空）
const handle = await fs.promises.open('/data.bin', 'w');
await handle.write('Hello');
await handle.write(' World');
await handle.close();

// 以追加模式打开
const appendHandle = await fs.promises.open('/log.txt', 'a');
await appendHandle.write('\nnew line');
await appendHandle.close();

// 以读取模式打开
const fd = await fs.promises.open('/data.bin', 'r');
const buffer = new Uint8Array(5);
const { bytesRead } = await fs.promises.read(fd.fd, buffer, 0, 5, 0);
console.log('Read:', new TextDecoder().decode(buffer)); // "Hello"
await fs.promises.close(fd.fd);
```

### 流（Stream）

对于大文件或需要分块处理的场景，可以使用流：

```ts
import fs, { Buffer } from '@system-ui-js/file-system-browser';

// 写入流
const ws = fs.createWriteStream('/large-file.txt');
ws.on('finish', () => console.log('写入完成'));
ws.on('error', (e) => console.error('写入失败:', e));

await ws.write('第一部分数据\n');
await ws.write('第二部分数据\n');
await ws.end('最后一部分');

// 读取流（分块读取）
const rs = fs.createReadStream('/large-file.txt', { highWaterMark: 16 });
rs.on('data', (chunk: Buffer) => {
  console.log('收到块:', chunk.toString());
});
rs.on('end', () => console.log('读取完成'));
rs.on('error', (e) => console.error('读取失败:', e));
```

### 文件监控

```ts
import fs from '@system-ui-js/file-system-browser';

// 监控文件变化（事件类型：'rename' 或 'change'）
const watcher = fs.watch('/watched.txt', (eventType, filename) => {
  console.log(`事件: ${eventType}, 文件: ${filename}`);
});

// 监控文件状态变化
fs.watchFile('/watched.txt', (curr, prev) => {
  console.log(`大小变化: ${prev.size} -> ${curr.size}`);
});

// 触发变化
await fs.promises.writeFile('/watched.txt', 'new content', 'utf8');

// 停止监控
watcher.close();
fs.unwatchFile('/watched.txt');
```

### 错误处理

所有 API 在出错时都会抛出异常（Promise 版本）或传递 Error 对象（回调版本）：

```ts
import fs from '@system-ui-js/file-system-browser';

// Promise 版本的错误处理
try {
  await fs.promises.readFile('/non-existent.txt', 'utf8');
} catch (err: any) {
  console.error('读取失败:', err.message);
  // 常见错误：ENOENT（文件不存在）、EISDIR（是目录不是文件）等
}

// 批量操作时的错误处理
async function safeRemove(paths: string[]) {
  for (const path of paths) {
    try {
      await fs.promises.rm(path, { recursive: true, force: true });
      console.log(`已删除: ${path}`);
    } catch (err: any) {
      console.error(`删除失败 ${path}:`, err.message);
    }
  }
}

// 确保目录存在（不存在则创建）
async function ensureDir(path: string) {
  try {
    await fs.promises.access(path);
  } catch {
    await fs.promises.mkdir(path, { recursive: true });
  }
}
```

## API 速查

### 导出内容

- **默认导出**：`fs` —— 主文件系统对象
- **命名导出**：
  - `Dirent`、`Stats`、`Buffer` —— 类型和工具类
  - `registerPlugin`、`usePlugin`、`unregisterPlugin` —— 插件管理
  - `sorter` —— 目录排序工具

### API 风格

- **`fs.promises.*`**：Promise 版 API（**推荐**使用）
- **`fs.*`**：回调版包装（也支持直接返回 Promise）
- **`fs.*Sync`**：同步风格方法名，但底层仍是异步实现（返回 Promise），用于降低从 Node.js 迁移的心智负担

### 完整 API 列表

| 类别 | 方法 | 说明 |
|------|------|------|
| **文件读写** | `readFile` / `writeFile` / `appendFile` | 读取/写入/追加文件 |
| **文件管理** | `copyFile` / `rename` / `unlink` / `rm` | 复制/重命名/删除 |
| **目录** | `mkdir` / `rmdir` / `readdir` | 创建/删除/读取目录 |
| **信息** | `stat` / `lstat` / `exists` / `access` | 文件状态/存在性/权限 |
| **链接** | `symlink` / `readlink` / `link` / `nlink` | 软链接/硬链接 |
| **描述符** | `open` / `read` / `write` / `close` | 文件描述符操作 |
| **流** | `createReadStream` / `createWriteStream` | 读写流 |
| **监控** | `watch` / `watchFile` / `unwatchFile` | 文件监控 |
| **存储** | `requestPersistentStorage` / `diskUsage` | 持久化授权/磁盘空间 |

## 存储持久化与磁盘空间

浏览器可能在空间紧张时清理站点数据。为尽量避免此情况，你可以请求"持久化存储"授权：

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
console.log(
  'total:',
  info.total,
  'free:',
  info.free,
  'available:',
  info.available
);

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

## 插件系统使用指南

### 为什么需要插件

主包默认**不挂载任何存储插件**。这意味着：

- 如果不使用插件，所有 `fs` 操作将使用内置的 IndexedDB 实现（默认行为）
- 使用插件可以将不同路径映射到不同的存储后端（如 `/webdav` → 远程服务器，`/memory` → 内存）
- 插件让你能够扩展文件系统，接入 WebDAV、自定义 API、网盘等外部存储

### 插件使用三步走

使用插件只需要三个步骤：**注册** → **启用** → **使用**：

```ts
import {
  registerPlugin,
  usePlugin,
  createIndexedDBStoragePlugin,
} from '@system-ui-js/file-system-browser';

// 第 1 步：注册插件工厂（仅登记，不激活）
registerPlugin('indexeddb', createIndexedDBStoragePlugin);

// 第 2 步：启用插件（实例化并挂载到指定路径）
usePlugin('indexeddb', { mountPath: '/data' });

// 第 3 步：正常使用 fs API，/data 路径下的操作将走该插件
await fs.promises.writeFile('/data/hello.txt', 'world', 'utf8');
```

### 路径匹配规则

插件通过 `mountPath` 或 `match` 正则来声明自己负责的路径范围：

#### `mountPath` 匹配（推荐）

`mountPath` 必须是根目录 `/` 或根目录下的一级路径（如 `/data`、`/webdav`），不支持嵌套：

```ts
usePlugin('webdav', { mountPath: '/webdav' });   // 负责 /webdav 及子路径
usePlugin('memory', { mountPath: '/memory' });   // 负责 /memory 及子路径
usePlugin('indexeddb', { mountPath: '/' });      // 负责根目录（兜底）
```

匹配规则：
- `/webdav/docs/readme.txt` → **WebDAV 插件**
- `/memory/temp.txt` → **内存插件**
- `/other/file.txt` → **IndexedDB 插件**（`/ ` 兜底）
- 一级挂载点优先于 `/`

#### `match` 正则匹配（向后兼容）

旧版插件使用 `match` 正则，仍然完全支持：

```ts
registerPlugin('cloud', (options, ctx) => ({
  match: /^\/cloud(\/|$)/,  // 匹配 /cloud 和 /cloud/xxx
  handlers: { /* ... */ },
}));
```

### 跨挂载点操作限制

涉及多个路径的操作（`rename`、`copyFile`、`link`）要求源路径和目标路径必须在**同一个挂载点**内：

```ts
// 允许：同挂载点内移动
await fs.promises.rename('/data/a.txt', '/data/b.txt');

// 抛出错误：跨挂载点操作
await fs.promises.rename('/data/a.txt', '/memory/b.txt'); // Error!
```

### 内置存储插件

#### IndexedDB 插件

将路径映射到内置 IndexedDB 存储。与默认行为完全一致，但可以通过插件机制统一管理：

```ts
import {
  registerPlugin,
  usePlugin,
  createIndexedDBStoragePlugin,
} from '@system-ui-js/file-system-browser';

// 方式一：Catch-all 模式（兼容旧代码，接管所有路径）
registerPlugin('indexeddb', createIndexedDBStoragePlugin);
usePlugin('indexeddb', {});

// 方式二：挂载到指定路径（推荐用于多后端共存）
registerPlugin('indexeddb', createIndexedDBStoragePlugin);
usePlugin('indexeddb', { mountPath: '/data' });
// 只有 /data 及其子路径走此插件，其他路径可挂载其他后端
```

#### 内存插件

将数据临时存储在页面内存中（非持久化），适用于临时文件、测试场景：

```ts
import {
  registerPlugin,
  usePlugin,
  createMemoryStoragePlugin,
} from '@system-ui-js/file-system-browser';

registerPlugin('memory', createMemoryStoragePlugin);
usePlugin('memory', { mountPath: '/tmp' });

// 在内存中读写
await fs.promises.writeFile('/tmp/session-data.json', '{"user": 1}', 'utf8');
const data = await fs.promises.readFile('/tmp/session-data.json', 'utf8');

// 清理：注销插件后数据立即释放
unregisterPlugin('memory');
```

⚠️ **注意**：内存插件的数据仅保存在当前页面会话中。刷新页面、关闭标签页或注销插件后，数据会丢失。

#### WebDAV 插件

将远程 WebDAV 服务器挂载到本地路径：

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
  username: 'user',
  password: 'pass',
  // 或使用 Token 认证
  // token: 'your-bearer-token',
  // 自定义请求头
  // headers: { 'X-Custom-Header': 'value' },
});

// 像操作本地文件一样操作远程文件
await fs.promises.mkdir('/webdav/projects', { recursive: true });
await fs.promises.writeFile('/webdav/projects/readme.md', '# Hello', 'utf8');
const files = await fs.promises.readdir('/webdav/projects');
```

**WebDAV 配置选项**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `baseUrl` | `string` | ✅ | WebDAV 服务器地址 |
| `mountPath` | `string` | - | 本地挂载路径，默认 `/webdav` |
| `remoteRoot` | `string` | - | 远程根路径，默认 `/` |
| `username` | `string` | - | 基本认证用户名 |
| `password` | `string` | - | 基本认证密码 |
| `token` | `string` | - | Bearer Token |
| `headers` | `Record<string, string>` | - | 自定义请求头 |
| `fetch` | `typeof fetch` | - | 自定义 fetch 实现 |

**⚠️ WebDAV 重要限制**：

- **CORS**：WebDAV 请求受浏览器同源策略限制。CORS 必须在**服务器端**配置，无法通过客户端代码绕过。
- **不支持的 API**：浏览器环境下无法使用 `watch`、`watchFile`、`unwatchFile`、`createReadStream`、`createWriteStream`，也不支持 `symlink`、`readlink`、`link`（硬链接）、`nlink`、文件描述符（`open/read/write/close`）。
- **内存限制**：文件内容在传输过程中会暂存于内存，超大文件可能导致内存不足。

### 多插件共存示例

在实际应用中，你可能需要同时使用多个存储后端：

```ts
import fs, {
  registerPlugin,
  usePlugin,
  createIndexedDBStoragePlugin,
  createMemoryStoragePlugin,
  createWebDAVStoragePlugin,
} from '@system-ui-js/file-system-browser';

// 注册所有需要的插件
registerPlugin('indexeddb', createIndexedDBStoragePlugin);
registerPlugin('memory', createMemoryStoragePlugin);
registerPlugin('webdav', createWebDAVStoragePlugin);

// 启用插件，各自负责不同路径
usePlugin('indexeddb', { mountPath: '/data' });      // 持久化数据
usePlugin('memory', { mountPath: '/tmp' });           // 临时文件
usePlugin('webdav', {                                // 远程文件
  mountPath: '/remote',
  baseUrl: 'https://cloud.example.com/dav',
});

// 现在可以统一使用 fs API 操作不同后端
await fs.promises.writeFile('/data/config.json', '{"theme": "dark"}', 'utf8');
await fs.promises.writeFile('/tmp/computation-result.tmp', '12345', 'utf8');
await fs.promises.writeFile('/remote/team-doc.md', '# Team Notes', 'utf8');

// 读取时自动路由到对应插件
const config = await fs.promises.readFile('/data/config.json', 'utf8');
const temp = await fs.promises.readFile('/tmp/computation-result.tmp', 'utf8');
```

### 插件生命周期与动态管理

插件可以在运行时动态启用、切换或注销：

```ts
import {
  registerPlugin,
  usePlugin,
  unregisterPlugin,
} from '@system-ui-js/file-system-browser';

// 注册插件工厂（只需执行一次）
registerPlugin('myPlugin', myFactory);

// 启用插件
usePlugin('myPlugin', { mountPath: '/mydata' });

// 切换配置（同名插件会覆盖旧实例）
usePlugin('myPlugin', { mountPath: '/mydata', option: 'new-value' });

// 注销插件（卸载并清理）
unregisterPlugin('myPlugin');

// 检查插件是否已启用
function isPluginActive(name: string): boolean {
  try {
    // 尝试执行一个操作来验证
    return true;
  } catch {
    return false;
  }
}
```

### 自定义插件

如果内置插件无法满足需求，你可以编写自己的插件：

#### 最小示例：虚拟云盘只读插件

```ts
import fs, {
  registerPlugin,
  usePlugin,
} from '@system-ui-js/file-system-browser';

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

#### 完整读写插件示例

```ts
import fs, {
  registerPlugin,
  usePlugin,
  type FsPluginContext,
  type FsHandlers,
} from '@system-ui-js/file-system-browser';

type MyFSOpts = { root: string };

const myFSFactory = (options: MyFSOpts, ctx: FsPluginContext) => ({
  match: /^\/myfs(\/|$)/,
  handlers: {
    async readFile(path: string, encoding?: BufferEncoding) {
      // 自定义实现：从远程获取
      const response = await fetch(options.root + path);
      const data = await response.arrayBuffer();
      return ctx.Buffer.from(new Uint8Array(data));
    },
    async writeFile(path: string, data: Uint8Array, encoding?: BufferEncoding) {
      // 自定义实现：上传到远程
      await fetch(options.root + path, {
        method: 'PUT',
        body: data,
      });
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

#### 插件工厂上下文

`FsPluginContext` 提供以下工具：

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

实现插件时注意：

- `ctx.Buffer` 与 Node.js 的 `Buffer` API 兼容（`fromString`/`from`/`alloc` 等）
- `handlers` 中未实现的 API 会自动回退到 `ctx.baseFs`
- 文件描述符操作需要 `createFd`/`releaseFd` 配合
- `watch`/`createReadStream` 等流式 API 可按需实现或回退到 `baseWatch`/`baseCreateReadStream`

### 插件测试

```ts
import {
  registerPlugin,
  usePlugin,
  unregisterPlugin,
} from '@system-ui-js/file-system-browser';

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

## 目录排序

排序不是文件系统（`fs`）本身的职责，因此本库将"排序状态"独立管理，提供一个与 `fs` 并列的工具单例 `sorter`，并使用单独的 IndexedDB 表进行持久化（不会污染 `fs` 的数据库结构）。

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

- `sorter` 的键默认使用"子项名称"（同一目录下唯一）。如你的 UI 使用完整路径作为唯一标识，可在接入层做转换。
- 常规排序会"目录靠前，同类比较"。自由排序时不进行目录/文件分组，由 `manualOrder/iconPositions` 决定顺序。
- 该模块与 `fs` 解耦。你可以在任何地方拿到目录条目后调用 `sorter.applySort()` 进行排序。

## 完整示例：构建一个简单的文件管理器

下面是一个结合主系统、插件和排序的完整示例：

```ts
import fs, {
  registerPlugin,
  usePlugin,
  createIndexedDBStoragePlugin,
  createMemoryStoragePlugin,
  sorter,
  type Dirent,
} from '@system-ui-js/file-system-browser';

class FileManager {
  private currentPath = '/';

  constructor() {
    // 初始化插件
    registerPlugin('indexeddb', createIndexedDBStoragePlugin);
    registerPlugin('memory', createMemoryStoragePlugin);
    usePlugin('indexeddb', { mountPath: '/data' });
    usePlugin('memory', { mountPath: '/tmp' });
  }

  async navigate(path: string) {
    this.currentPath = path;
    const entries = await fs.promises.readdir(path, { withFileTypes: true });
    const sorted = await sorter.applySort(path, entries, { view: 'list' });
    return sorted;
  }

  async createFile(name: string, content: string) {
    const path = `${this.currentPath}/${name}`;
    await fs.promises.writeFile(path, content, 'utf8');
    await sorter.onEntriesAdded(this.currentPath, [name]);
  }

  async createDirectory(name: string) {
    const path = `${this.currentPath}/${name}`;
    await fs.promises.mkdir(path);
    await sorter.onEntriesAdded(this.currentPath, [name]);
  }

  async deleteEntry(name: string) {
    const path = `${this.currentPath}/${name}`;
    const stat = await fs.promises.stat(path);
    if (stat.isDirectory()) {
      await fs.promises.rm(path, { recursive: true });
    } else {
      await fs.promises.unlink(path);
    }
    await sorter.onEntriesRemoved(this.currentPath, [name]);
  }

  async moveTo(fromPath: string, toDir: string) {
    const name = fromPath.split('/').pop()!;
    const toPath = `${toDir}/${name}`;
    await fs.promises.rename(fromPath, toPath);
    await sorter.onEntriesMoved(fromPath.replace(/\/[^/]+$/, ''), toDir, [name]);
  }

  async readTextFile(path: string): Promise<string> {
    return await fs.promises.readFile(path, 'utf8');
  }

  async writeTextFile(path: string, content: string) {
    await fs.promises.writeFile(path, content, 'utf8');
  }
}

// 使用
const fm = new FileManager();

// 创建一些文件和目录
await fm.createDirectory('projects');
await fm.createFile('readme.md', '# My Files');
await fm.createFile('todo.txt', '- [ ] Learn file-system-browser');

// 浏览根目录
const entries = await fm.navigate('/data');
for (const entry of entries) {
  console.log(`${entry.isDirectory() ? '📁' : '📄'} ${entry.name}`);
}

// 读取文件
const content = await fm.readTextFile('/data/readme.md');
console.log(content);
```

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
- 流与监控为 best-effort 实现：`createWriteStream` 在内存中累积数据，`end()` 时一次性落盘；`watch/watchFile` 为进程内事件分发，并且仅监听"精确路径"（不会像真实文件系统那样自动监听目录下的子项变更）。
- 未实现的 Node API（如 `realpath/chmod/chown/cp/mkdtemp` 等）会抛出不支持错误。
- 数据落盘位置：IndexedDB 数据库名为 `FileSystemDB`；目录排序数据库名为 `FileSystemSortDB`。

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
