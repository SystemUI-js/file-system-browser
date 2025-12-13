# @system-ui-js/file-system-browser

一个基于 IndexedDB 的 WebDAV 风格文件系统库，用于在浏览器中持久化存储文件。

## 特性

- 🗄️ 基于 IndexedDB 的持久化存储
- 📁 完整的文件系统操作（创建、读取、更新、删除）
- 🔄 支持文件和文件夹的复制、移动
- 📊 WebDAV 风格的 API 设计
- 💾 支持 Blob 和 ArrayBuffer
- 🎯 TypeScript 类型支持
- 🚀 零依赖

## 安装

```bash
npm install @system-ui-js/file-system-browser
# 或
yarn add @system-ui-js/file-system-browser
```

## 使用示例

### 基本用法

```typescript
import { FileSystem } from '@system-ui-js/file-system-browser';

// 创建文件系统实例
const fs = new FileSystem();

// 初始化
await fs.init();

// 上传文件
const file = new File(['Hello World'], 'hello.txt', { type: 'text/plain' });
await fs.put('/hello.txt', file);

// 读取文件
const content = await fs.get('/hello.txt');
console.log(new TextDecoder().decode(content));

// 创建目录
await fs.mkdir('/documents');

// 列出目录内容
const files = await fs.propfind('/');
console.log(files);

// 复制文件
await fs.copy('/hello.txt', '/documents/hello-copy.txt');

// 移动文件
await fs.move('/hello.txt', '/documents/hello.txt');

// 删除文件
await fs.delete('/documents/hello.txt');

// 获取文件信息
const stat = await fs.stat('/documents/hello-copy.txt');
console.log(stat);

// 检查文件是否存在
const exists = await fs.exists('/documents/hello-copy.txt');
console.log(exists);

// 清空所有文件
await fs.clear();
```

## API 文档

### FileSystem

#### `async init(): Promise<void>`

初始化文件系统。必须在使用其他方法之前调用。

#### `async put(path: string, content: ArrayBuffer | Blob, mimeType?: string): Promise<void>`

上传或更新文件。

- `path`: 文件路径
- `content`: 文件内容（ArrayBuffer 或 Blob）
- `mimeType`: MIME 类型（可选，如果 content 是 Blob 则自动获取）

#### `async get(path: string): Promise<ArrayBuffer | null>`

读取文件内容。

#### `async delete(path: string): Promise<void>`

删除文件或目录（递归删除）。

#### `async copy(sourcePath: string, destPath: string): Promise<void>`

复制文件或目录。

#### `async move(sourcePath: string, destPath: string): Promise<void>`

移动文件或目录。

#### `async propfind(path: string): Promise<FileInfo[]>`

列出目录内容或获取文件信息。

#### `async mkdir(path: string): Promise<void>`

创建目录。

#### `async exists(path: string): Promise<boolean>`

检查路径是否存在。

#### `async stat(path: string): Promise<FileInfo | null>`

获取文件或目录的详细信息。

#### `async clear(): Promise<void>`

清空文件系统中的所有文件。

### FileInfo

```typescript
interface FileInfo {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  mimeType?: string;
  createdAt: number;
  modifiedAt: number;
  parentPath: string;
}
```

## Demo

访问 [在线 Demo](https://system-ui-js.github.io/file-system/) 查看实际效果。

Demo 展示了以下功能：
- 文件上传
- 创建文件夹
- 文件列表展示
- 文件下载
- 文件/文件夹的复制、剪切、粘贴
- 查看文件详情
- 删除文件/文件夹

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
