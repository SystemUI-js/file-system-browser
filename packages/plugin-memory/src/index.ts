import type {
  BufferEncoding,
  FileEntry,
  FsPluginContext,
  FsPluginFactory,
} from '@system-ui-js/file-system-browser';
import {
  Buffer as BufferPolyfill,
  Dirent,
  Stats,
} from '@system-ui-js/file-system-browser';

export interface MemoryStoragePluginOptions {
  mountPath?: string;
}

type EncOpt =
  | { encoding?: BufferEncoding | null; flag?: string }
  | BufferEncoding
  | null;

type WriteOpt =
  | { encoding?: BufferEncoding | null; mode?: number | string; flag?: string }
  | BufferEncoding
  | null;

type WatchListener = (eventType: 'rename' | 'change', filename: string) => void;
type FileWatchListener = (curr: Stats, prev: Stats) => void;

type FdState = {
  path: string;
  position: number;
  flags: string;
};

type ReadStreamEvents = {
  data: (chunk: BufferPolyfill) => void;
  end: () => void;
  error: (err: unknown) => void;
  close: () => void;
};

type WriteStreamEvents = {
  finish: () => void;
  error: (err: unknown) => void;
};

function norm(path: string): string {
  if (!path.startsWith('/')) path = `/${path}`;
  if (path !== '/' && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}

function parentOf(path: string): string {
  path = norm(path);
  if (path === '/') return '';
  const i = path.lastIndexOf('/');
  return i === 0 ? '/' : path.slice(0, i);
}

function baseOf(path: string): string {
  path = norm(path);
  if (path === '/') return '';
  const i = path.lastIndexOf('/');
  return path.slice(i + 1);
}

function parseEncOpt(options?: EncOpt): { encoding?: BufferEncoding | null } {
  if (!options) return {};
  if (typeof options === 'string') return { encoding: options };
  return { encoding: options.encoding };
}

function parseWriteOpt(options?: WriteOpt): {
  encoding?: BufferEncoding | null;
} {
  if (!options) return {};
  if (typeof options === 'string') return { encoding: options };
  return { encoding: options.encoding };
}

function cloneBytes(data?: ArrayBuffer): ArrayBuffer {
  return new Uint8Array(data ?? new ArrayBuffer(0)).slice().buffer;
}

function cloneEntry(entry: FileEntry): FileEntry {
  return {
    ...entry,
    content: entry.content ? cloneBytes(entry.content) : undefined,
  };
}

function entryToStats(entry: FileEntry): Stats {
  return new Stats(cloneEntry(entry));
}

function toBuffer(
  data: Iterable<number> | ArrayBuffer | Uint8Array | string,
  encoding?: BufferEncoding | null
): BufferPolyfill {
  if (typeof data === 'string') {
    return BufferPolyfill.fromString(data, encoding || 'utf8');
  }
  if (data instanceof ArrayBuffer) {
    return new BufferPolyfill(new Uint8Array(data).slice());
  }
  if (data instanceof Uint8Array) {
    return new BufferPolyfill(data.slice());
  }
  return new BufferPolyfill(Array.from(data));
}

function outByEncoding(buf: Uint8Array, encoding?: BufferEncoding | null) {
  if (!encoding) return new BufferPolyfill(buf.slice());
  return new BufferPolyfill(buf.slice()).toString(encoding);
}

function rootEntry(now = Date.now()): FileEntry {
  return {
    path: '/',
    name: '',
    type: 'directory',
    size: 0,
    createdAt: now,
    modifiedAt: now,
    parentPath: '',
  };
}

function fileEntry(
  path: string,
  content: Uint8Array,
  prev?: FileEntry | null,
  hardLinkKey?: string
): FileEntry {
  const now = Date.now();
  return {
    path,
    name: baseOf(path),
    type: 'file',
    size: content.byteLength,
    content: content.slice().buffer,
    mimeType: 'application/octet-stream',
    hardLinkKey: hardLinkKey ?? prev?.hardLinkKey,
    createdAt: prev?.createdAt || now,
    modifiedAt: now,
    parentPath: parentOf(path),
  };
}

function directoryEntry(path: string): FileEntry {
  const now = Date.now();
  return {
    path,
    name: baseOf(path),
    type: 'directory',
    size: 0,
    createdAt: now,
    modifiedAt: now,
    parentPath: parentOf(path),
  };
}

function symlinkEntry(path: string, target: string): FileEntry {
  const now = Date.now();
  return {
    path,
    name: baseOf(path),
    type: 'symlink',
    size: 0,
    linkTarget: norm(target),
    createdAt: now,
    modifiedAt: now,
    parentPath: parentOf(path),
  };
}

function listDirectChildren(
  entries: Map<string, FileEntry>,
  path: string
): FileEntry[] {
  path = norm(path);
  return Array.from(entries.values()).filter(
    (entry) => entry.parentPath === path
  );
}

export const createMemoryStoragePlugin: FsPluginFactory<
  MemoryStoragePluginOptions
> = (options, ctx: FsPluginContext) => {
  const entries = new Map<string, FileEntry>();
  entries.set('/', rootEntry());

  const watchers = new Map<string, Set<WatchListener>>();
  const fileWatchers = new Map<string, Set<FileWatchListener>>();
  const fdStates = new Map<number, FdState>();

  function toLocalSymlinkTarget(target: string): string {
    const targetPath = norm(target);
    const mountPath = options.mountPath ? norm(options.mountPath) : undefined;
    if (!mountPath) return targetPath;
    if (targetPath === mountPath) return '/';
    if (targetPath.startsWith(`${mountPath}/`)) {
      return norm(targetPath.slice(mountPath.length));
    }
    return targetPath;
  }

  function emitWatch(
    path: string,
    type: 'rename' | 'change',
    prev?: FileEntry | null,
    next?: FileEntry | null
  ) {
    path = norm(path);
    const set = watchers.get(path);
    if (set) {
      for (const cb of Array.from(set)) {
        try {
          cb(type, baseOf(path));
        } catch {
          /* noop */
        }
      }
    }
    const fileSet = fileWatchers.get(path);
    if (fileSet && prev && next) {
      const curr = entryToStats(next);
      const before = entryToStats(prev);
      for (const cb of Array.from(fileSet)) {
        try {
          cb(curr, before);
        } catch {
          /* noop */
        }
      }
    }
  }

  function resolveSymlink(
    path: string,
    allowMissingTarget = false
  ): { path: string; entry?: FileEntry } {
    let current = norm(path);
    const seen = new Set<string>();
    for (let depth = 0; depth < 10; depth++) {
      const entry = entries.get(current);
      if (!entry) return { path: current, entry: undefined };
      if (entry.type !== 'symlink') return { path: current, entry };
      const target = entry.linkTarget;
      if (!target) throw new Error(`EINVAL: invalid symlink '${current}'`);
      const next = norm(target);
      if (seen.has(next)) {
        throw new Error(`ELOOP: too many symbolic links, '${path}'`);
      }
      seen.add(next);
      current = next;
      if (allowMissingTarget && !entries.has(current)) {
        return { path: current, entry: undefined };
      }
    }
    throw new Error(`ELOOP: too many symbolic links, '${path}'`);
  }

  function ensureParentDirectory(path: string, operation: string): string {
    const parent = parentOf(path);
    if (!parent) return parent;
    const parentEntry = entries.get(parent);
    if (!parentEntry) {
      throw new Error(
        `ENOENT: no such file or directory, ${operation} '${parent}'`
      );
    }
    if (parentEntry.type !== 'directory') {
      throw new Error(`ENOTDIR: not a directory, ${operation} '${parent}'`);
    }
    return parent;
  }

  function hardLinkSiblings(entry: FileEntry): FileEntry[] {
    if (!entry.hardLinkKey) return [];
    return Array.from(entries.values()).filter(
      (candidate) =>
        candidate.type === 'file' && candidate.hardLinkKey === entry.hardLinkKey
    );
  }

  function writeFileInternal(path: string, data: Uint8Array): void {
    const resolved = resolveSymlink(path, true);
    path = norm(resolved.path);
    ensureParentDirectory(path, 'open');
    const prev = entries.get(path) ?? null;
    if (prev?.type === 'directory') {
      throw new Error(
        `EISDIR: illegal operation on a directory, open '${path}'`
      );
    }
    const next = fileEntry(path, data, prev);
    entries.set(path, next);
    emitWatch(path, prev ? 'change' : 'rename', prev, next);

    if (next.hardLinkKey) {
      for (const sibling of hardLinkSiblings(next)) {
        if (sibling.path === path) continue;
        const before = cloneEntry(sibling);
        const updated: FileEntry = {
          ...sibling,
          size: next.size,
          content: cloneBytes(next.content),
          mimeType: next.mimeType,
          modifiedAt: next.modifiedAt,
        };
        entries.set(updated.path, updated);
        emitWatch(updated.path, 'change', before, updated);
      }
    }
  }

  function readFileInternal(path: string): Uint8Array {
    const { entry } = resolveSymlink(path);
    if (!entry)
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    if (entry.type !== 'file')
      throw new Error('EISDIR: illegal operation on a directory, read');
    return new Uint8Array(
      entry.content ? cloneBytes(entry.content) : new ArrayBuffer(0)
    );
  }

  function mkdirInternal(path: string, recursive?: boolean): void {
    path = norm(path);
    if (path === '/') return;
    const existing = entries.get(path);
    if (existing) {
      if (existing.type !== 'directory')
        throw new Error(`EEXIST: file already exists, mkdir '${path}'`);
      return;
    }
    const parent = parentOf(path);
    const parentEntry = entries.get(parent);
    if (!parentEntry) {
      if (recursive) mkdirInternal(parent, true);
      else
        throw new Error(`ENOENT: no such file or directory, mkdir '${parent}'`);
    } else if (parentEntry.type !== 'directory') {
      throw new Error(`ENOTDIR: not a directory, mkdir '${parent}'`);
    }
    const entry = directoryEntry(path);
    entries.set(path, entry);
    emitWatch(path, 'rename', null, entry);
  }

  function deleteRecursive(
    path: string,
    recursive?: boolean,
    force?: boolean
  ): void {
    path = norm(path);
    if (path === '/') throw new Error('EBUSY: cannot remove root');
    const entry = entries.get(path);
    if (!entry) {
      if (force) return;
      throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
    }
    if (entry.type === 'directory') {
      const children = listDirectChildren(entries, path);
      if (children.length && !recursive) {
        throw new Error(`ENOTEMPTY: directory not empty, rmdir '${path}'`);
      }
      for (const child of children) deleteRecursive(child.path, true, force);
    }
    entries.delete(path);
    emitWatch(path, 'rename', entry, null);
  }

  function renameInternal(oldPath: string, newPath: string): void {
    oldPath = norm(oldPath);
    newPath = norm(newPath);
    if (oldPath === '/') throw new Error('EXDEV: cannot move root');
    const entry = entries.get(oldPath);
    if (!entry) {
      throw new Error(
        `ENOENT: no such file or directory, rename '${oldPath}' -> '${newPath}'`
      );
    }
    ensureParentDirectory(newPath, 'rename');
    const existing = entries.get(newPath);
    if (
      existing?.type === 'directory' &&
      listDirectChildren(entries, newPath).length
    ) {
      throw new Error(`ENOTEMPTY: directory not empty, rename '${newPath}'`);
    }
    if (existing) deleteRecursive(newPath, true, true);
    const now = Date.now();
    const moved: FileEntry = {
      ...cloneEntry(entry),
      path: newPath,
      name: baseOf(newPath),
      parentPath: parentOf(newPath),
      modifiedAt: now,
    };
    entries.set(newPath, moved);
    entries.delete(oldPath);

    if (entry.type === 'directory') {
      const descendants = Array.from(entries.values())
        .filter((child) => child.path.startsWith(`${oldPath}/`))
        .sort((a, b) => a.path.length - b.path.length);
      for (const child of descendants) {
        const childOldPath = child.path;
        const childNewPath = norm(
          `${newPath}${child.path.slice(oldPath.length)}`
        );
        const updated: FileEntry = {
          ...cloneEntry(child),
          path: childNewPath,
          name: baseOf(childNewPath),
          parentPath: parentOf(childNewPath),
          modifiedAt: now,
        };
        entries.set(childNewPath, updated);
        entries.delete(childOldPath);
      }
    }
    emitWatch(oldPath, 'rename', entry, moved);
    emitWatch(newPath, 'rename', null, moved);
  }

  function readFd(
    fd: number,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number | null
  ) {
    const state = fdStates.get(fd);
    if (!state) throw new Error('EBADF: bad file descriptor, read');
    const data = readFileInternal(state.path);
    const start = position ?? state.position;
    const end = Math.min(start + length, data.length);
    const slice = data.subarray(start, end);
    buffer.set(slice, offset);
    if (position == null) state.position = end;
    return { bytesRead: slice.length, buffer };
  }

  function writeFd(
    fd: number,
    bufOrStr: Uint8Array | string,
    offset?: number,
    length?: number,
    position?: number | null
  ) {
    const state = fdStates.get(fd);
    if (!state) throw new Error('EBADF: bad file descriptor, write');
    const buf =
      typeof bufOrStr === 'string' ? toBuffer(bufOrStr) : toBuffer(bufOrStr);
    const toWrite =
      length != null && offset != null
        ? buf.subarray(offset, offset + length)
        : buf;
    const current = entries.has(state.path)
      ? readFileInternal(state.path)
      : new Uint8Array();
    const start = position ?? state.position;
    const needed = start + toWrite.length;
    const next =
      current.length < needed ? new Uint8Array(needed) : current.slice();
    next.set(current.subarray(0, Math.min(current.length, next.length)), 0);
    next.set(toWrite, start);
    writeFileInternal(state.path, next);
    if (position == null) state.position = start + toWrite.length;
    return { bytesWritten: toWrite.length, buffer: bufOrStr };
  }

  function readdirHandler(
    path: string,
    options: { withFileTypes: true; encoding?: BufferEncoding } | BufferEncoding
  ): Promise<Dirent[]>;
  function readdirHandler(
    path: string,
    options?:
      | { withFileTypes?: false; encoding?: BufferEncoding }
      | BufferEncoding
  ): Promise<string[]>;
  async function readdirHandler(
    path: string,
    options?:
      | { withFileTypes?: boolean; encoding?: BufferEncoding }
      | BufferEncoding
  ): Promise<Array<Dirent | string>> {
    path = norm(path);
    const entry = entries.get(path);
    if (!entry)
      throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
    if (entry.type !== 'directory')
      throw new Error(`ENOTDIR: not a directory, scandir '${path}'`);
    const children = listDirectChildren(entries, path);
    const withFileTypes =
      typeof options === 'object' ? !!options.withFileTypes : false;
    return withFileTypes
      ? children.map((child) => new Dirent(child.name, child.type))
      : children.map((child) => child.name);
  }

  return {
    match: /^\/(?:.*)$/,
    mountPath: options.mountPath,
    handlers: {
      async readFile(path: string | number, options?: EncOpt) {
        const { encoding } = parseEncOpt(options);
        if (typeof path === 'number') {
          const state = fdStates.get(path);
          if (!state) throw new Error('EBADF: bad file descriptor, read');
          return outByEncoding(readFileInternal(state.path), encoding);
        }
        return outByEncoding(readFileInternal(path), encoding);
      },
      async writeFile(
        file: string | number,
        data: Iterable<number>,
        options?: WriteOpt
      ) {
        const { encoding } = parseWriteOpt(options);
        if (typeof file === 'number') {
          const state = fdStates.get(file);
          if (!state) throw new Error('EBADF: bad file descriptor, write');
          writeFileInternal(state.path, toBuffer(data, encoding));
          return;
        }
        writeFileInternal(file, toBuffer(data, encoding));
      },
      async appendFile(
        file: string | number,
        data: Iterable<number>,
        options?: WriteOpt
      ) {
        const { encoding } = parseWriteOpt(options);
        const path = typeof file === 'number' ? fdStates.get(file)?.path : file;
        if (!path) throw new Error('EBADF: bad file descriptor, write');
        const base = entries.has(norm(path))
          ? readFileInternal(path)
          : new Uint8Array();
        writeFileInternal(
          path,
          BufferPolyfill.concat([base, toBuffer(data, encoding)])
        );
      },
      async rename(oldPath: string, newPath: string) {
        renameInternal(oldPath, newPath);
      },
      async copyFile(src: string, dest: string) {
        writeFileInternal(dest, readFileInternal(src));
      },
      async mkdir(
        path: string,
        options?: number | string | { recursive?: boolean }
      ) {
        mkdirInternal(
          path,
          typeof options === 'object' ? !!options.recursive : false
        );
      },
      readdir: readdirHandler,
      async rm(
        path: string,
        options?: { recursive?: boolean; force?: boolean }
      ) {
        deleteRecursive(path, options?.recursive, options?.force);
      },
      async unlink(path: string) {
        const entry = entries.get(norm(path));
        if (entry?.type === 'directory')
          throw new Error(
            `EISDIR: illegal operation on a directory, unlink '${path}'`
          );
        deleteRecursive(path, false, false);
      },
      async rmdir(path: string, options?: { recursive?: boolean }) {
        const entry = entries.get(norm(path));
        if (entry && entry.type !== 'directory')
          throw new Error(`ENOTDIR: not a directory, rmdir '${path}'`);
        deleteRecursive(path, options?.recursive, false);
      },
      async stat(path: string) {
        const { entry } = resolveSymlink(path);
        if (!entry)
          throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
        return entryToStats(entry);
      },
      async lstat(path: string) {
        const entry = entries.get(norm(path));
        if (!entry)
          throw new Error(`ENOENT: no such file or directory, lstat '${path}'`);
        return entryToStats(entry);
      },
      async readlink(path: string) {
        const entry = entries.get(norm(path));
        if (!entry)
          throw new Error(
            `ENOENT: no such file or directory, readlink '${path}'`
          );
        if (entry.type !== 'symlink')
          throw new Error(`EINVAL: invalid argument, readlink '${path}'`);
        return entry.linkTarget || '';
      },
      async symlink(target: string, path: string) {
        path = norm(path);
        if (path === '/')
          throw new Error('EPERM: operation not permitted, symlink to root');
        ensureParentDirectory(path, 'symlink parent');
        if (entries.has(path))
          throw new Error(`EEXIST: file already exists, symlink '${path}'`);
        const entry = symlinkEntry(path, toLocalSymlinkTarget(target));
        entries.set(path, entry);
        emitWatch(path, 'rename', null, entry);
      },
      async link(existingPath: string, newPath: string) {
        existingPath = norm(existingPath);
        newPath = norm(newPath);
        const { entry } = resolveSymlink(existingPath);
        if (!entry)
          throw new Error(
            `ENOENT: no such file or directory, link '${existingPath}'`
          );
        if (entry.type !== 'file')
          throw new Error(
            `EPERM: hard link target must be a file, got '${existingPath}'`
          );
        ensureParentDirectory(newPath, 'link parent');
        if (entries.has(newPath))
          throw new Error(`EEXIST: file already exists, link '${newPath}'`);
        const key = entry.hardLinkKey || entry.path;
        if (!entry.hardLinkKey)
          entries.set(entry.path, { ...entry, hardLinkKey: key });
        const linked = fileEntry(
          newPath,
          new Uint8Array(entry.content ?? new ArrayBuffer(0)),
          null,
          key
        );
        entries.set(newPath, linked);
        emitWatch(newPath, 'rename', null, linked);
      },
      async exists(path: string) {
        return !!resolveSymlink(path).entry;
      },
      async access(path: string) {
        if (!resolveSymlink(path).entry)
          throw new Error(
            `ENOENT: no such file or directory, access '${path}'`
          );
      },
      async nlink(path: string) {
        const { entry } = resolveSymlink(path);
        if (!entry || entry.type !== 'file') return 0;
        if (!entry.hardLinkKey) return 1;
        return hardLinkSiblings(entry).length;
      },
      async open(path: string, flags: string) {
        const resolved = resolveSymlink(path, true);
        path = norm(resolved.path);
        const existing = entries.get(path);
        if (!existing && flags.startsWith('r')) {
          throw new Error(`ENOENT: no such file or directory, open '${path}'`);
        }
        if (existing?.type === 'directory') {
          throw new Error(
            `EISDIR: illegal operation on a directory, open '${path}'`
          );
        }
        if (!existing && /[wa]/.test(flags))
          writeFileInternal(path, new Uint8Array());
        if (flags.startsWith('w')) writeFileInternal(path, new Uint8Array());
        const fd = ctx.createFd(path, flags);
        fdStates.set(fd, {
          path,
          flags,
          position: flags.startsWith('a') ? readFileInternal(path).length : 0,
        });
        return {
          fd,
          close: async () => {
            fdStates.delete(fd);
            ctx.releaseFd(fd);
          },
          read: async (
            buffer: Uint8Array,
            offset: number,
            length: number,
            position: number | null
          ) => readFd(fd, buffer, offset, length, position),
          write: async (
            buffer: Uint8Array | string,
            offset?: number,
            length?: number,
            position?: number | null
          ) => writeFd(fd, buffer, offset, length, position),
        };
      },
      async read(
        fd: number,
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number | null
      ) {
        return readFd(fd, buffer, offset, length, position);
      },
      async write(
        fd: number,
        buffer: Uint8Array | string,
        offset?: number,
        length?: number,
        position?: number | null
      ) {
        return writeFd(fd, buffer, offset, length, position);
      },
      async close(fd: number) {
        if (!fdStates.has(fd))
          throw new Error('EBADF: bad file descriptor, close');
        fdStates.delete(fd);
        ctx.releaseFd(fd);
      },
      watch(filename: string, listener?: WatchListener) {
        filename = norm(filename);
        if (listener) {
          const set = watchers.get(filename) || new Set<WatchListener>();
          set.add(listener);
          watchers.set(filename, set);
        }
        return {
          close() {
            if (listener) watchers.get(filename)?.delete(listener);
          },
        };
      },
      watchFile(filename: string, listener: FileWatchListener) {
        filename = norm(filename);
        const set = fileWatchers.get(filename) || new Set<FileWatchListener>();
        set.add(listener);
        fileWatchers.set(filename, set);
      },
      unwatchFile(filename: string, listener?: FileWatchListener) {
        filename = norm(filename);
        if (!listener) {
          fileWatchers.delete(filename);
          return;
        }
        fileWatchers.get(filename)?.delete(listener);
      },
      createReadStream(path: string, opts?: { highWaterMark?: number }) {
        const listeners: {
          [K in keyof ReadStreamEvents]: ReadStreamEvents[K][];
        } = {
          data: [],
          end: [],
          error: [],
          close: [],
        };
        let paused = false;
        const high = opts?.highWaterMark ?? 64 * 1024;
        (async () => {
          try {
            await Promise.resolve();
            const data = readFileInternal(path);
            for (let i = 0; i < data.length; i += high) {
              const chunk = data.subarray(i, Math.min(i + high, data.length));
              while (paused)
                await new Promise((resolve) => setTimeout(resolve, 10));
              listeners.data.forEach((handler) => {
                handler(new BufferPolyfill(chunk));
              });
            }
            listeners.end.forEach((handler) => {
              handler();
            });
            listeners.close.forEach((handler) => {
              handler();
            });
          } catch (err) {
            listeners.error.forEach((handler) => {
              handler(err);
            });
          }
        })();
        return {
          on<E extends keyof ReadStreamEvents>(
            event: E,
            handler: ReadStreamEvents[E]
          ) {
            listeners[event].push(handler);
            return this;
          },
          pause() {
            paused = true;
            return this;
          },
          resume() {
            paused = false;
            return this;
          },
          close() {
            listeners.close.forEach((handler) => {
              handler();
            });
          },
          pipe(dest: {
            write: (chunk: Uint8Array | BufferPolyfill | string) => unknown;
            end?: () => unknown;
          }) {
            this.on('data', (chunk: BufferPolyfill) => {
              dest.write(chunk);
            });
            this.on('end', () => {
              dest.end?.();
            });
            return dest;
          },
        };
      },
      createWriteStream(path: string) {
        const listeners: {
          [K in keyof WriteStreamEvents]: WriteStreamEvents[K][];
        } = {
          finish: [],
          error: [],
        };
        let buffer = new Uint8Array();
        return {
          async write(chunk: Uint8Array | BufferPolyfill | string) {
            buffer = BufferPolyfill.concat([buffer, toBuffer(chunk)]);
            return true;
          },
          async end(chunk?: Uint8Array | BufferPolyfill | string) {
            if (chunk) await this.write(chunk);
            try {
              writeFileInternal(path, buffer);
              listeners.finish.forEach((handler) => {
                handler();
              });
            } catch (err) {
              listeners.error.forEach((handler) => {
                handler(err);
              });
            }
          },
          on<E extends keyof WriteStreamEvents>(
            event: E,
            handler: WriteStreamEvents[E]
          ) {
            listeners[event].push(handler);
            return this;
          },
        };
      },
    },
  };
};
