import { db, FileEntry } from './db';

// Local type to avoid @types/node dependency
export type BufferEncoding =
  | 'utf8'
  | 'utf-8'
  | 'base64'
  | 'ascii'
  | 'latin1'
  | 'hex'
  | 'utf16le'
  | 'ucs2'
  | 'ucs-2'
  | 'binary';

// Minimal Buffer polyfill built on Uint8Array
export class BufferPolyfill extends Uint8Array {
  static fromString(input: string, encoding: string = 'utf8'): BufferPolyfill {
    if (encoding === 'utf8' || encoding === 'utf-8') {
      const enc = new TextEncoder();
      return new BufferPolyfill(enc.encode(input));
    }
    if (encoding === 'base64') {
      const bin = atob(input);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new BufferPolyfill(bytes);
    }
    throw new Error(`Unsupported encoding: ${encoding}`);
  }

  static alloc(size: number, fill?: number | string, encoding: string = 'utf8'): BufferPolyfill {
    const buf = new BufferPolyfill(size);
    if (fill !== undefined) {
      if (typeof fill === 'number') {
        buf.fill(fill);
      } else {
        const temp = BufferPolyfill.fromString(fill, encoding);
        for (let i = 0; i < buf.length; i++) buf[i] = temp[i % temp.length];
      }
    }
    return buf;
  }

  static concat(list: Uint8Array[], totalLength?: number): BufferPolyfill {
    if (!totalLength) totalLength = list.reduce((acc, b) => acc + b.length, 0);
    const out = new Uint8Array(totalLength);
    let offset = 0;
    for (const b of list) {
      out.set(b, offset);
      offset += b.length;
    }
    return new BufferPolyfill(out);
  }

  static isBuffer(obj: any): obj is BufferPolyfill {
    return obj instanceof Uint8Array;
  }

  toString(encoding: string = 'utf8'): string {
    if (encoding === 'utf8' || encoding === 'utf-8') {
      const dec = new TextDecoder();
      return dec.decode(this);
    }
    if (encoding === 'base64') {
      let binary = '';
      for (let i = 0; i < this.length; i++) binary += String.fromCharCode(this[i]);
      // btoa expects binary string
      return btoa(binary);
    }
    throw new Error(`Unsupported encoding: ${encoding}`);
  }
}

// Stats & Dirent
export class Stats {
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  birthtimeMs: number;
  mode: number;
  private _type: 'file' | 'directory' | 'symlink';
  constructor(entry: FileEntry & { linkTarget?: string; hardLinkOf?: string }) {
    this.size = entry.size || 0;
    this.mtimeMs = entry.modifiedAt;
    this.ctimeMs = entry.createdAt;
    this.birthtimeMs = entry.createdAt;
    this.mode = 0o666; // no permission model in browser
    // extend: symlink identified via type === 'symlink'
    this._type = (entry as any).type === 'symlink' ? 'symlink' : entry.type;
  }
  isFile() { return this._type === 'file'; }
  isDirectory() { return this._type === 'directory'; }
  isSymbolicLink() { return this._type === 'symlink'; }
}

export class Dirent {
  name: string;
  private _type: 'file' | 'directory' | 'symlink';
  constructor(name: string, type: 'file' | 'directory' | 'symlink') {
    this.name = name;
    this._type = type;
  }
  isFile() { return this._type === 'file'; }
  isDirectory() { return this._type === 'directory'; }
  isSymbolicLink() { return this._type === 'symlink'; }
}

// Internal initialization and helpers
let _initialized = false;
async function ensureInit() {
  if (_initialized) return;
  await db.init();
  const root = await db.get('/');
  if (!root) {
    const now = Date.now();
    await db.put({ path: '/', name: '', type: 'directory', size: 0, createdAt: now, modifiedAt: now, parentPath: '' });
  }
  _initialized = true;
}

function norm(path: string): string {
  if (!path.startsWith('/')) path = '/' + path;
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

// Basic event bus for watch APIs
type WatchListener = (eventType: 'rename' | 'change', filename: string) => void;
const watchers = new Map<string, Set<WatchListener>>();
const fileWatchers = new Map<string, Set<(curr: Stats, prev: Stats) => void>>();
function emitWatch(path: string, type: 'rename' | 'change', prev?: FileEntry | null, next?: FileEntry | null) {
  const set = watchers.get(path);
  if (set) {
    for (const cb of Array.from(set)) {
      try { cb(type, baseOf(path)); } catch {}
    }
  }
  const wf = fileWatchers.get(path);
  if (wf && prev && next) {
    const currStats = new Stats(next);
    const prevStats = new Stats(prev);
    for (const cb of Array.from(wf)) {
      try { cb(currStats, prevStats); } catch {}
    }
  }
}

// FD table
type FD = { path: string; position: number; flags: string };
const fdTable = new Map<number, FD>();
let nextFd = 3; // 0,1,2 reserved

async function pathExists(path: string): Promise<FileEntry | undefined> {
  await ensureInit();
  return await db.get(norm(path));
}

// Resolve symlink chains (max depth to avoid cycles). If allowMissingTarget=true,
// we don't require the final target to exist, we just return the resolved path string.
async function resolveSymlink(path: string, allowMissingTarget = false): Promise<{ path: string; entry?: FileEntry }> {
  await ensureInit();
  let p = norm(path);
  const seen = new Set<string>();
  for (let i = 0; i < 10; i++) {
    const e = await db.get(p);
    if (!e) {
      if (allowMissingTarget && i > 0) {
        // we've followed at least one symlink; the final target may not exist
        return { path: p, entry: undefined };
      }
      return { path: p, entry: undefined };
    }
    if (e.type === 'symlink') {
      const target = (e as any).linkTarget as string;
      if (!target) throw new Error(`EINVAL: invalid symlink '${p}'`);
      const np = norm(target);
      if (seen.has(np)) throw new Error(`ELOOP: too many symbolic links, '${path}'`);
      seen.add(np);
      p = np;
      continue;
    }
    return { path: p, entry: e };
  }
  throw new Error(`ELOOP: too many symbolic links, '${path}'`);
}

// Read helpers
function outByEncoding(buf: Uint8Array, encoding?: string): any {
  if (!encoding) return new BufferPolyfill(buf);
  return new BufferPolyfill(buf).toString(encoding);
}

// Core operations powered by IndexedDB
async function writeFileInternal(path: string, data: Uint8Array): Promise<void> {
  await ensureInit();
  // follow symlink for writing; create file at final target if missing
  const resolved = await resolveSymlink(path, true);
  path = norm(resolved.path);
  const now = Date.now();
  // ensure parent dir
  const parent = parentOf(path);
  if (parent) {
    const p = await db.get(parent);
    if (!p) throw new Error(`ENOENT: no such file or directory, open '${parent}'`);
    if (p.type !== 'directory') throw new Error(`ENOTDIR: not a directory, mkdir '${parent}'`);
  }
  const prev = (await db.get(path)) || null;
  const entry: FileEntry = {
    path,
    name: baseOf(path),
    type: 'file',
    size: data.byteLength,
    content: new Uint8Array(data).slice(0).buffer as ArrayBuffer,
    mimeType: 'application/octet-stream',
    createdAt: prev?.createdAt || now,
    modifiedAt: now,
    parentPath: parent,
    hardLinkKey: prev?.hardLinkKey,
  };
  await db.put(entry);
  emitWatch(path, prev ? 'change' : 'rename', prev, entry);
  // propagate to hard link siblings if any
  if (entry.hardLinkKey) {
    const siblings = await db.getByHardLinkKey(entry.hardLinkKey);
    for (const s of siblings) {
      if (s.path === entry.path) continue;
      if (s.type !== 'file') continue;
      const before = { ...s } as FileEntry;
      const updated: FileEntry = {
        ...s,
        size: entry.size,
        content: entry.content,
        mimeType: entry.mimeType,
        modifiedAt: now,
      };
      await db.put(updated);
      emitWatch(updated.path, 'change', before, updated);
    }
  }
}

async function readFileInternal(path: string): Promise<Uint8Array> {
  await ensureInit();
  const { entry } = await resolveSymlink(path);
  if (!entry) throw new Error(`ENOENT: no such file or directory, open '${path}'`);
  if (entry.type !== 'file') throw new Error(`EISDIR: illegal operation on a directory, read`);
  const buf = entry.content ? new Uint8Array(entry.content) : new Uint8Array();
  return buf;
}

async function mkdirInternal(path: string, recursive?: boolean): Promise<void> {
  await ensureInit();
  path = norm(path);
  if (path === '/') return;
  const exist = await db.get(path);
  if (exist) return; // idempotent
  const parent = parentOf(path);
  if (parent) {
    const p = await db.get(parent);
    if (!p) {
      if (recursive) {
        await mkdirInternal(parent, true);
      } else {
        throw new Error(`ENOENT: no such file or directory, mkdir '${parent}'`);
      }
    } else if (p.type !== 'directory') {
      throw new Error(`ENOTDIR: not a directory, mkdir '${parent}'`);
    }
  }
  const now = Date.now();
  const dir: FileEntry = { path, name: baseOf(path), type: 'directory', size: 0, createdAt: now, modifiedAt: now, parentPath: parent };
  await db.put(dir);
  emitWatch(path, 'rename', null, dir);
}

async function removeInternal(path: string, recursive?: boolean, force?: boolean): Promise<void> {
  await ensureInit();
  path = norm(path);
  if (path === '/') throw new Error('EBUSY: cannot remove root');
  const entry = await db.get(path);
  if (!entry) {
    if (force) return;
    throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
  }
  if (entry.type === 'directory') {
    const children = await db.getByParentPath(path);
    if (children.length && !recursive) throw new Error(`ENOTEMPTY: directory not empty, rmdir '${path}'`);
    for (const c of children) await removeInternal(c.path, true, force);
  }
  await db.delete(path);
  emitWatch(path, 'rename', entry, null as any);
}

async function renameInternal(oldPath: string, newPath: string): Promise<void> {
  await ensureInit();
  oldPath = norm(oldPath); newPath = norm(newPath);
  if (oldPath === '/') throw new Error('EXDEV: cannot move root');
  const entry = await db.get(oldPath);
  if (!entry) throw new Error(`ENOENT: no such file or directory, rename '${oldPath}' -> '${newPath}'`);
  // ensure dest parent
  const destParent = parentOf(newPath);
  if (destParent) {
    const p = await db.get(destParent);
    if (!p) throw new Error(`ENOENT: no such file or directory, rename '${destParent}'`);
    if (p.type !== 'directory') throw new Error(`ENOTDIR: not a directory, rename '${destParent}'`);
  }
  // move
  const now = Date.now();
  const moved: FileEntry = { ...entry, path: newPath, name: baseOf(newPath), modifiedAt: now, parentPath: destParent };
  await db.put(moved);
  await db.delete(oldPath);
  // move children if directory
  if (entry.type === 'directory') {
    const children = await db.getByParentPath(oldPath);
    for (const child of children) {
      const newChildPath = newPath + child.path.slice(oldPath.length);
      await renameInternal(child.path, newChildPath);
    }
  }
  emitWatch(oldPath, 'rename', entry, moved);
}

// Public fs API (subset + placeholders)
type EncOpt = { encoding?: BufferEncoding | null; flag?: string } | BufferEncoding | null;
function parseEncOpt(options?: EncOpt): { encoding?: BufferEncoding | null; flag?: string } {
  if (!options) return {};
  if (typeof options === 'string') return { encoding: options } as any;
  return options as any;
}

// promises implementation
async function fdRead(fdNum: number, buffer: Uint8Array, offset: number, length: number, position: number | null) {
  const fd = fdTable.get(fdNum);
  if (!fd) throw new Error(`EBADF: bad file descriptor, read`);
  const entry = await db.get(fd.path);
  if (!entry || entry.type !== 'file') return { bytesRead: 0, buffer };
  const data = new Uint8Array(entry.content || new ArrayBuffer(0));
  const start = position ?? fd.position;
  const end = Math.min(start + length, data.length);
  const slice = data.subarray(start, end);
  buffer.set(slice, offset);
  if (position == null) fd.position = end;
  return { bytesRead: slice.length, buffer };
}

async function fdWrite(fdNum: number, bufOrStr: Uint8Array | string, offset?: number, length?: number, position?: number | null) {
  const fd = fdTable.get(fdNum);
  if (!fd) throw new Error(`EBADF: bad file descriptor, write`);
  const buf = typeof bufOrStr === 'string' ? BufferPolyfill.from(bufOrStr) : new BufferPolyfill(bufOrStr as any);
  let data = await readFileInternal(fd.path).catch(() => new Uint8Array());
  const start = position ?? fd.position;
  const needed = start + (length ?? buf.length);
  if (data.length < needed) {
    const expanded = new Uint8Array(needed);
    expanded.set(data, 0);
    data = expanded;
  }
  const toWrite = (length != null && offset != null) ? buf.subarray(offset, offset + length) : buf;
  data.set(toWrite, start);
  await writeFileInternal(fd.path, data);
  if (position == null) fd.position = start + toWrite.length;
  return { bytesWritten: toWrite.length, buffer: bufOrStr };
}

const promises = {
  async readFile(path: string | number, options?: EncOpt): Promise<any> {
    if (typeof path === 'number') {
      const fd = fdTable.get(path);
      if (!fd) throw new Error(`EBADF: bad file descriptor, read`);
      const buf = await readFileInternal(fd.path);
      const { encoding } = parseEncOpt(options);
      return outByEncoding(buf, encoding || undefined);
    }
    const buf = await readFileInternal(path);
    const { encoding } = parseEncOpt(options);
    return outByEncoding(buf, encoding || undefined);
  },

  async writeFile(file: string | number, data: any, options?: { encoding?: BufferEncoding | null; mode?: number | string; flag?: string } | BufferEncoding | null): Promise<void> {
    const enc = typeof options === 'string' ? options : options?.encoding || undefined;
    const buf = BufferPolyfill.isBuffer(data) || data instanceof Uint8Array ? new BufferPolyfill(data as any) : BufferPolyfill.fromString(String(data), enc || 'utf8');
    if (typeof file === 'number') {
      const fd = fdTable.get(file);
      if (!fd) throw new Error(`EBADF: bad file descriptor, write`);
      await writeFileInternal(fd.path, buf);
      return;
    }
    await writeFileInternal(file, buf);
  },

  async appendFile(file: string | number, data: any, options?: BufferEncoding | { encoding?: BufferEncoding | null; mode?: number | string; flag?: string } | null): Promise<void> {
    const enc = typeof options === 'string' ? options : options?.encoding || undefined;
    const add = BufferPolyfill.isBuffer(data) || data instanceof Uint8Array ? new BufferPolyfill(data as any) : BufferPolyfill.fromString(String(data), enc || 'utf8');
    const targetPath = typeof file === 'number' ? (fdTable.get(file)?.path ?? (() => { throw new Error('EBADF'); })()) : file;
    const existed = await pathExists(targetPath);
    const base = existed ? await readFileInternal(targetPath) : new Uint8Array();
    const merged = BufferPolyfill.concat([base, add]);
    await writeFileInternal(targetPath as string, merged);
  },

  async rename(oldPath: string, newPath: string): Promise<void> { await renameInternal(oldPath, newPath); },
  async copyFile(src: string, dest: string): Promise<void> {
    const data = await readFileInternal(src);
    await writeFileInternal(dest, data);
  },
  async mkdir(path: string, options?: number | string | { recursive?: boolean; mode?: number | string }): Promise<void> {
    const recursive = typeof options === 'object' ? !!options.recursive : false;
    await mkdirInternal(path, recursive);
  },
  async readdir(path: string, options?: { withFileTypes?: boolean; encoding?: BufferEncoding } | BufferEncoding): Promise<any> {
    await ensureInit();
    path = norm(path);
    const withFileTypes = typeof options === 'object' ? !!options.withFileTypes : false;
    const dir = await db.get(path);
    if (!dir) throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
    if (dir.type !== 'directory') throw new Error(`ENOTDIR: not a directory, scandir '${path}'`);
    const list = await db.getByParentPath(path);
    if (withFileTypes) {
      return list.map(e => new Dirent(e.name, (e as any).type === 'symlink' ? 'symlink' : e.type));
    }
    return list.map(e => e.name);
  },
  async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> { await removeInternal(path, options?.recursive, options?.force); },
  async unlink(path: string): Promise<void> { await removeInternal(path, false, false); },
  async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> { await removeInternal(path, options?.recursive, false); },
  async stat(path: string): Promise<Stats> {
    await ensureInit();
    const r = await resolveSymlink(path);
    const e = r.entry;
    if (!e) throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
    return new Stats(e as any);
  },
  async lstat(path: string): Promise<Stats> {
    await ensureInit();
    const e = await db.get(norm(path));
    if (!e) throw new Error(`ENOENT: no such file or directory, lstat '${path}'`);
    return new Stats(e as any);
  },
  async readlink(path: string): Promise<string> {
    await ensureInit();
    const e = await db.get(norm(path));
    if (!e) throw new Error(`ENOENT: no such file or directory, readlink '${path}'`);
    if (e.type !== 'symlink') throw new Error(`EINVAL: invalid argument, readlink '${path}'`);
    return (e as any).linkTarget || '';
  },
  async symlink(target: string, path: string): Promise<void> {
    await ensureInit();
    target = norm(target);
    path = norm(path);
    if (path === '/') throw new Error('EPERM: operation not permitted, symlink to root');
    const parent = parentOf(path);
    if (parent) {
      const p = await db.get(parent);
      if (!p) throw new Error(`ENOENT: no such file or directory, symlink parent '${parent}'`);
      if (p.type !== 'directory') throw new Error(`ENOTDIR: not a directory, symlink parent '${parent}'`);
    }
    const exist = await db.get(path);
    if (exist) throw new Error(`EEXIST: file already exists, symlink '${path}'`);
    const now = Date.now();
    const entry: FileEntry = {
      path,
      name: baseOf(path),
      type: 'symlink',
      size: 0,
      content: undefined,
      mimeType: undefined,
      linkTarget: target,
      createdAt: now,
      modifiedAt: now,
      parentPath: parent,
    };
    await db.put(entry);
    emitWatch(path, 'rename', null as any, entry);
  },
  async link(existingPath: string, newPath: string): Promise<void> {
    await ensureInit();
    existingPath = norm(existingPath);
    newPath = norm(newPath);
    const src = await resolveSymlink(existingPath); // follow symlink for hard link target
    const e = src.entry;
    if (!e) throw new Error(`ENOENT: no such file or directory, link '${existingPath}'`);
    if (e.type !== 'file') throw new Error(`EPERM: hard link target must be a file, got '${existingPath}'`);
    const parent = parentOf(newPath);
    if (parent) {
      const p = await db.get(parent);
      if (!p) throw new Error(`ENOENT: no such file or directory, link parent '${parent}'`);
      if (p.type !== 'directory') throw new Error(`ENOTDIR: not a directory, link parent '${parent}'`);
    }
    const exist = await db.get(newPath);
    if (exist) throw new Error(`EEXIST: file already exists, link '${newPath}'`);
    // ensure src has a hardLinkKey
    const key = e.hardLinkKey || e.path; // use original path string as group key
    if (!e.hardLinkKey) {
      const updated: FileEntry = { ...e, hardLinkKey: key };
      await db.put(updated);
    }
    const now = Date.now();
    const newEntry: FileEntry = {
      path: newPath,
      name: baseOf(newPath),
      type: 'file',
      size: e.size,
      content: e.content,
      mimeType: e.mimeType,
      hardLinkKey: key,
      createdAt: now,
      modifiedAt: now,
      parentPath: parent,
    };
    await db.put(newEntry);
    emitWatch(newPath, 'rename', null as any, newEntry);
  },
  async exists(path: string): Promise<boolean> { return !!(await pathExists(path)); },
  async access(path: string, _mode?: number): Promise<void> { if (!(await pathExists(path))) throw new Error(`ENOENT: no such file or directory, access '${path}'`); },
  async nlink(path: string): Promise<number> {
    await ensureInit();
    const r = await resolveSymlink(path);
    const e = r.entry;
    if (!e) return 0;
    if (e.type !== 'file') return 0;
    if (!e.hardLinkKey) return 1;
    const list = await db.getByHardLinkKey(e.hardLinkKey);
    return list.filter((x) => x.type === 'file').length;
  },
  async open(path: string, flags: string, _mode?: number): Promise<{ fd: number; close: () => Promise<void>; read: (buffer: Uint8Array, offset: number, length: number, position: number | null) => Promise<{ bytesRead: number; buffer: Uint8Array }>; write: (buffer: Uint8Array | string, offset?: number, length?: number, position?: number | null) => Promise<{ bytesWritten: number; buffer: Uint8Array | BufferPolyfill | string }>; }> {
    await ensureInit();
    // resolve for opening
    const r = await resolveSymlink(path, true);
    path = norm(r.path);
    // create/truncate behavior per flags (simplified)
    const exists = await db.get(path);
    if (!exists && /[wa]/.test(flags)) {
      await writeFileInternal(path, new Uint8Array());
    }
    if (!exists && flags.startsWith('r')) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    const fd = nextFd++;
    fdTable.set(fd, { path, position: 0, flags });
    return {
      fd,
      close: async () => { fdTable.delete(fd); },
      read: async (buffer, offset, length, position) => fdRead(fd, buffer, offset, length, position),
      write: async (bufOrStr, offset?: number, length?: number, position?: number | null) => fdWrite(fd, bufOrStr as any, offset, length, position),
    };
  },
  async read(fd: number, buffer: Uint8Array, offset: number, length: number, position: number | null) { return fdRead(fd, buffer, offset, length, position); },
  async write(fd: number, buffer: Uint8Array | string, offset?: number, length?: number, position?: number | null) { return fdWrite(fd, buffer as any, offset, length, position); },
  async close(fd: number) { fdTable.delete(fd); },

  /**
   * Request persistent storage for this origin.
   * Returns true if already persisted or successfully persisted.
   */
  async requestPersistentStorage(): Promise<boolean> {
    const ns: any = (globalThis as any).navigator?.storage;
    if (!ns) throw new Error('StorageManager is not available in this environment');
    if (typeof ns.persisted === 'function') {
      try {
        const already = await ns.persisted();
        if (already) return true;
      } catch {
        // ignore
      }
    }
    if (typeof ns.persist === 'function') {
      const ok = await ns.persist();
      if (ok) return true;
      throw new Error('Persistent storage request was denied');
    }
    throw new Error('navigator.storage.persist is not supported');
  },

  /**
   * Approximate Node.js fs.diskUsage using navigator.storage.estimate.
   * Signature compatible with Node: diskUsage(pathOrOptions?, options?)
   * Returns { total, free, available } (numbers or bigints based on options.bigint).
   */
  async diskUsage(pathOrOptions?: string | { bigint?: boolean }, options?: { bigint?: boolean }): Promise<{ total: number; free: number; available: number } | { total: bigint; free: bigint; available: bigint }> {
    const opts = (typeof pathOrOptions === 'object' && pathOrOptions && typeof (pathOrOptions as any).bigint !== 'undefined')
      ? (pathOrOptions as { bigint?: boolean })
      : (options || {});
    const sm: any = (globalThis as any).navigator?.storage;
    if (!sm || typeof sm.estimate !== 'function') {
      const zero = opts?.bigint ? { total: 0n, free: 0n, available: 0n } : { total: 0, free: 0, available: 0 };
      return zero as any;
    }
    const est = await sm.estimate();
    const quota = est.quota ?? 0;
    const usage = est.usage ?? 0;
    const total = quota;
    const available = Math.max(0, total - usage);
    const free = available; // best-effort approximation
    if (opts?.bigint) {
      return { total: BigInt(Math.floor(total)), free: BigInt(Math.floor(free)), available: BigInt(Math.floor(available)) } as any;
    }
    return { total, free, available } as any;
  },
};

// Callback wrappers
function cbWrap(fn: (...args: any[]) => Promise<any>) {
  return (...args: any[]) => {
    const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    const p = fn(...args);
    if (cb) {
      p.then((res) => cb(null, res)).catch((err) => cb(err));
      return;
    }
    return p; // also support promise usage
  };
}

// Stream minimal implementations (best-effort)
function createReadStream(path: string, opts?: { highWaterMark?: number }) {
  const listeners: Record<string, Function[]> = { data: [], end: [], error: [], close: [] };
  let paused = false;
  const high = opts?.highWaterMark ?? 64 * 1024;
  (async () => {
    try {
      const data = await readFileInternal(path);
      for (let i = 0; i < data.length; i += high) {
        const chunk = data.subarray(i, Math.min(i + high, data.length));
        while (paused) await new Promise((r) => setTimeout(r, 10));
        listeners.data.forEach((h) => h(new BufferPolyfill(chunk)));
      }
      listeners.end.forEach((h) => h());
      listeners.close.forEach((h) => h());
    } catch (e) {
      listeners.error.forEach((h) => h(e));
    }
  })();
  return {
    on(ev: 'data' | 'end' | 'error' | 'close', h: Function) { (listeners[ev] ||= []).push(h); return this; },
    pause() { paused = true; return this; },
    resume() { paused = false; return this; },
    close() { listeners.close.forEach((h) => h()); },
    pipe(dest: any) { this.on('data', (c: any) => dest.write(c)); this.on('end', () => dest.end && dest.end()); return dest; },
  };
}

function createWriteStream(path: string) {
  const listeners: Record<string, Function[]> = { finish: [], error: [] };
  let buffer = new Uint8Array();
  return {
    async write(chunk: any) {
      const b = BufferPolyfill.isBuffer(chunk) || chunk instanceof Uint8Array ? new Uint8Array(chunk as any) : BufferPolyfill.from(String(chunk));
      buffer = BufferPolyfill.concat([buffer, b]);
      return true;
    },
    async end(chunk?: any) {
      if (chunk) await this.write(chunk);
      try { await writeFileInternal(path, buffer); listeners.finish.forEach((h) => h()); } catch (e) { listeners.error.forEach((h) => h(e)); }
    },
    on(ev: 'finish' | 'error', h: Function) { (listeners[ev] ||= []).push(h); return this; },
  };
}

// watch APIs
function watch(filename: string, listener?: WatchListener) {
  filename = norm(filename);
  if (listener) {
    const set = watchers.get(filename) || new Set();
    set.add(listener);
    watchers.set(filename, set);
  }
  return {
    close() {
      if (listener) {
        const set = watchers.get(filename);
        if (set) set.delete(listener);
      }
    },
  };
}

function watchFile(filename: string, listener: (curr: Stats, prev: Stats) => void) {
  filename = norm(filename);
  const set = fileWatchers.get(filename) || new Set();
  set.add(listener);
  fileWatchers.set(filename, set);
}
function unwatchFile(filename: string, listener?: (curr: Stats, prev: Stats) => void) {
  filename = norm(filename);
  if (!listener) { fileWatchers.delete(filename); return; }
  const set = fileWatchers.get(filename);
  if (set) set.delete(listener);
}

// Placeholder unsupported methods
function notSupported(name: string) {
  return async (..._args: any[]) => { throw new Error(`${name} is not supported in browser IndexedDB environment`); };
}

// Build fs namespace-like object
export const fs = {
  // promises
  promises,
  constants: { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 },

  // callback style wrappers (same names as Node)
  readFile: cbWrap(promises.readFile),
  writeFile: cbWrap(promises.writeFile),
  appendFile: cbWrap(promises.appendFile),
  rename: cbWrap(promises.rename),
  copyFile: cbWrap(promises.copyFile),
  mkdir: cbWrap(promises.mkdir),
  readdir: cbWrap(promises.readdir),
  rm: cbWrap(promises.rm),
  unlink: cbWrap(promises.unlink),
  rmdir: cbWrap(promises.rmdir),
  stat: cbWrap(promises.stat),
  lstat: cbWrap(promises.lstat),
  readlink: cbWrap(promises.readlink),
  readlinkSync: cbWrap(promises.readlink),
  open(path: string, flags: string, mode: any, cb?: (err: any, fd?: number) => void) {
    if (typeof mode === 'function') { cb = mode; mode = undefined as any; }
    const p = promises.open(path, flags, mode as any).then(h => h.fd);
    if (cb) { p.then((fd) => (cb as any)(null, fd)).catch((e) => (cb as any)(e)); return; }
    return p;
  },
  close(fd: number, cb?: (err?: any) => void) {
    const p = promises.close(fd);
    if (cb) { p.then(() => cb()).catch(cb); return; }
    return p;
  },
  read(fd: number, buffer: Uint8Array, offset: number, length: number, position: number | null, cb?: (err: any, bytesRead?: number, buffer?: Uint8Array) => void) {
    const p = promises.read(fd, buffer, offset, length, position).then(r => r);
    if (cb) { p.then(r => cb(null, r.bytesRead, r.buffer)).catch(cb); return; }
    return p;
  },
  write(fd: number, buffer: Uint8Array | string, offset?: number, length?: number, position?: number | null, cb?: (err: any, bytesWritten?: number, buffer?: any) => void) {
    const p = promises.write(fd, buffer as any, offset, length, position);
    if (cb) { p.then(r => cb(null, r.bytesWritten, r.buffer)).catch(cb); return; }
    return p;
  },
  exists(path: string, cb?: (exists: boolean) => void) {
    const p = promises.exists(path);
    if (cb) { p.then((v) => cb(v)); return; }
    return p;
  },
  access: cbWrap(promises.access),

  // storage-related helpers
  requestPersistentStorage: cbWrap(promises.requestPersistentStorage),
  diskUsage: cbWrap(promises.diskUsage as any),

  // sync method names but still Promise-based as requested
  readFileSync: cbWrap(promises.readFile),
  writeFileSync: cbWrap(promises.writeFile),
  appendFileSync: cbWrap(promises.appendFile),
  renameSync: cbWrap(promises.rename),
  copyFileSync: cbWrap(promises.copyFile),
  mkdirSync: cbWrap(promises.mkdir),
  readdirSync: cbWrap(promises.readdir),
  rmSync: cbWrap(promises.rm),
  unlinkSync: cbWrap(promises.unlink),
  rmdirSync: cbWrap(promises.rmdir),
  statSync: cbWrap(promises.stat),
  lstatSync: cbWrap(promises.lstat),
  openSync: cbWrap(async (path: string, flags: string, mode?: number) => (await promises.open(path, flags, mode)).fd),
  closeSync: cbWrap(async (fd: number) => { fdTable.delete(fd); }),
  readSync: cbWrap(async (fd: number, buffer: Uint8Array, offset: number, length: number, position: number | null) => (await promises.read(fd, buffer, offset, length, position)).bytesRead),
  writeSync: cbWrap(async (fd: number, buffer: Uint8Array | string, offset?: number, length?: number, position?: number | null) => (await promises.write(fd, buffer as any, offset, length, position)).bytesWritten),

  // streams
  createReadStream,
  createWriteStream,

  // watch
  watch,
  watchFile,
  unwatchFile,

  // placeholders for large unimplemented APIs
  realpath: notSupported('realpath'),
  realpathSync: notSupported('realpathSync'),
  cp: notSupported('cp'),
  chmod: notSupported('chmod'),
  chown: notSupported('chown'),
  lutimes: notSupported('lutimes'),
  mkdtemp: notSupported('mkdtemp'),
  mkdtempSync: notSupported('mkdtempSync'),
  link: cbWrap(promises.link),
  linkSync: cbWrap(promises.link),
  symlink: cbWrap(promises.symlink),
  symlinkSync: cbWrap(promises.symlink),
};

export type { FileEntry };
