import { db, FileEntry } from './db';

export interface FileInfo {
  path: string;
  name: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  mimeType?: string;
  createdAt: number;
  modifiedAt: number;
  parentPath: string;
}

export class FileSystem {
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await db.init();
    this.initialized = true;

    // Create root directory if it doesn't exist
    const root = await db.get('/');
    if (!root) {
      await db.put({
        path: '/',
        name: '',
        type: 'directory',
        size: 0,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        parentPath: '',
      });
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('FileSystem not initialized. Call init() first.');
    }
  }

  private normalizePath(path: string): string {
    if (!path.startsWith('/')) {
      path = '/' + path;
    }
    if (path !== '/' && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return path;
  }

  private getParentPath(path: string): string {
    const normalized = this.normalizePath(path);
    if (normalized === '/') return '';
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash === 0 ? '/' : normalized.slice(0, lastSlash);
  }

  private getFileName(path: string): string {
    const normalized = this.normalizePath(path);
    if (normalized === '/') return '';
    const lastSlash = normalized.lastIndexOf('/');
    return normalized.slice(lastSlash + 1);
  }

  async put(
    path: string,
    content: ArrayBuffer | Blob,
    mimeType?: string
  ): Promise<void> {
    this.ensureInitialized();
    path = this.normalizePath(path);

    // Ensure parent directory exists
    const parentPath = this.getParentPath(path);
    if (parentPath) {
      const parent = await db.get(parentPath);
      if (!parent) {
        throw new Error(`Parent directory does not exist: ${parentPath}`);
      }
      if (parent.type !== 'directory') {
        throw new Error(`Parent is not a directory: ${parentPath}`);
      }
    }

    let arrayBuffer: ArrayBuffer;
    if (content instanceof Blob) {
      arrayBuffer = await content.arrayBuffer();
      if (!mimeType) {
        mimeType = content.type;
      }
    } else {
      arrayBuffer = content;
    }

    const existing = await db.get(path);
    const now = Date.now();

    const entry: FileEntry = {
      path,
      name: this.getFileName(path),
      type: 'file',
      size: arrayBuffer.byteLength,
      content: arrayBuffer,
      mimeType: mimeType || 'application/octet-stream',
      createdAt: existing?.createdAt || now,
      modifiedAt: now,
      parentPath,
    };

    await db.put(entry);
  }

  async get(path: string): Promise<ArrayBuffer | null> {
    this.ensureInitialized();
    path = this.normalizePath(path);

    const entry = await db.get(path);
    if (!entry) return null;
    if (entry.type !== 'file') {
      throw new Error(`Path is not a file: ${path}`);
    }
    return entry.content || null;
  }

  async delete(path: string): Promise<void> {
    this.ensureInitialized();
    path = this.normalizePath(path);

    if (path === '/') {
      throw new Error('Cannot delete root directory');
    }

    const entry = await db.get(path);
    if (!entry) {
      throw new Error(`Path does not exist: ${path}`);
    }

    // If directory, delete all children recursively
    if (entry.type === 'directory') {
      const children = await db.getByParentPath(path);
      for (const child of children) {
        await this.delete(child.path);
      }
    }

    await db.delete(path);
  }

  async copy(sourcePath: string, destPath: string): Promise<void> {
    this.ensureInitialized();
    sourcePath = this.normalizePath(sourcePath);
    destPath = this.normalizePath(destPath);

    const source = await db.get(sourcePath);
    if (!source) {
      throw new Error(`Source path does not exist: ${sourcePath}`);
    }

    if (await db.get(destPath)) {
      throw new Error(`Destination path already exists: ${destPath}`);
    }

    // Ensure parent directory exists
    const parentPath = this.getParentPath(destPath);
    if (parentPath) {
      const parent = await db.get(parentPath);
      if (!parent || parent.type !== 'directory') {
        throw new Error(`Parent directory does not exist: ${parentPath}`);
      }
    }

    const now = Date.now();
    const newEntry: FileEntry = {
      ...source,
      path: destPath,
      name: this.getFileName(destPath),
      parentPath,
      createdAt: now,
      modifiedAt: now,
    };

    await db.put(newEntry);

    // If directory, copy all children recursively
    if (source.type === 'directory') {
      const children = await db.getByParentPath(sourcePath);
      for (const child of children) {
        const childDestPath = destPath + child.path.slice(sourcePath.length);
        await this.copy(child.path, childDestPath);
      }
    }
  }

  async move(sourcePath: string, destPath: string): Promise<void> {
    this.ensureInitialized();
    sourcePath = this.normalizePath(sourcePath);
    destPath = this.normalizePath(destPath);

    if (sourcePath === '/') {
      throw new Error('Cannot move root directory');
    }

    await this.copy(sourcePath, destPath);
    await this.delete(sourcePath);
  }

  async propfind(path: string): Promise<FileInfo[]> {
    this.ensureInitialized();
    path = this.normalizePath(path);

    const entry = await db.get(path);
    if (!entry) {
      throw new Error(`Path does not exist: ${path}`);
    }

    if (entry.type === 'file') {
      return [this.entryToInfo(entry)];
    }

    const children = await db.getByParentPath(path);
    return children.map((child) => this.entryToInfo(child));
  }

  async mkdir(path: string): Promise<void> {
    this.ensureInitialized();
    path = this.normalizePath(path);

    if (await db.get(path)) {
      throw new Error(`Path already exists: ${path}`);
    }

    // Ensure parent directory exists
    const parentPath = this.getParentPath(path);
    if (parentPath) {
      const parent = await db.get(parentPath);
      if (!parent) {
        throw new Error(`Parent directory does not exist: ${parentPath}`);
      }
      if (parent.type !== 'directory') {
        throw new Error(`Parent is not a directory: ${parentPath}`);
      }
    }

    const now = Date.now();
    const entry: FileEntry = {
      path,
      name: this.getFileName(path),
      type: 'directory',
      size: 0,
      createdAt: now,
      modifiedAt: now,
      parentPath,
    };

    await db.put(entry);
  }

  async exists(path: string): Promise<boolean> {
    this.ensureInitialized();
    path = this.normalizePath(path);
    const entry = await db.get(path);
    return !!entry;
  }

  async stat(path: string): Promise<FileInfo | null> {
    this.ensureInitialized();
    path = this.normalizePath(path);
    const entry = await db.get(path);
    return entry ? this.entryToInfo(entry) : null;
  }

  async clear(): Promise<void> {
    this.ensureInitialized();
    await db.clear();
    // Recreate root directory
    await db.put({
      path: '/',
      name: '',
      type: 'directory',
      size: 0,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      parentPath: '',
    });
  }

  private entryToInfo(entry: FileEntry): FileInfo {
    return {
      path: entry.path,
      name: entry.name,
      type: entry.type,
      size: entry.size,
      mimeType: entry.mimeType,
      createdAt: entry.createdAt,
      modifiedAt: entry.modifiedAt,
      parentPath: entry.parentPath,
    };
  }
}
