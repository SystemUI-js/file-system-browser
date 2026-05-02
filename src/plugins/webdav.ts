import {
  Dirent,
  Stats,
  type BufferEncoding,
  type FsPluginFactory,
} from '../fs';
import { createClient } from 'webdav/web';

export interface WebDAVStoragePluginOptions {
  baseUrl: string;
  mountPath?: string;
  remoteRoot?: string;
  authType?: 'auto' | 'digest' | 'none' | 'password' | 'token';
  username?: string;
  password?: string;
  token?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  withCredentials?: boolean;
}

type WebDAVFileStat = {
  basename?: string;
  filename?: string;
  type?: 'file' | 'directory' | string;
  size?: number | string;
  lastmod?: string;
};

type WebDAVClient = {
  getFileContents(
    path: string,
    options: { format: 'binary' }
  ): Promise<unknown>;
  putFileContents(path: string, data: Uint8Array): Promise<unknown>;
  createDirectory(path: string): Promise<unknown>;
  getDirectoryContents(
    path: string
  ): Promise<WebDAVFileStat[] | WebDAVFileStat>;
  deleteFile(path: string): Promise<unknown>;
  moveFile(from: string, to: string): Promise<unknown>;
  copyFile(from: string, to: string): Promise<unknown>;
  stat(path: string): Promise<WebDAVFileStat>;
  exists(path: string): Promise<boolean>;
};

type EncOpt =
  | { encoding?: BufferEncoding | null; flag?: string }
  | BufferEncoding
  | null;

type WriteOpt =
  | { encoding?: BufferEncoding | null; mode?: number | string; flag?: string }
  | BufferEncoding
  | null;

function norm(path: string): string {
  if (!path.startsWith('/')) path = `/${path}`;
  if (path !== '/' && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function remotePath(remoteRoot: string, localPath: string): string {
  const root = norm(remoteRoot || '/');
  const local = norm(localPath || '/');
  if (root === '/') return local;
  if (local === '/') return root;
  return `${root}${local}`;
}

function basename(path: string): string {
  const normalized = norm(path);
  if (normalized === '/') return '';
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

function fileStatName(stat: WebDAVFileStat): string {
  return stat.basename || basename(stat.filename || '');
}

function fileStatType(stat: WebDAVFileStat): 'file' | 'directory' | 'symlink' {
  return stat.type === 'directory' ? 'directory' : 'file';
}

function fileStatTime(stat: WebDAVFileStat): number {
  const timestamp = stat.lastmod ? Date.parse(stat.lastmod) : NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function toStats(stat: WebDAVFileStat): Stats {
  const type = fileStatType(stat);
  const timestamp = fileStatTime(stat);
  const size = Number(stat.size ?? 0);
  const stats = new Stats({
    path: norm(stat.filename || `/${fileStatName(stat)}`),
    name: fileStatName(stat),
    type,
    size: Number.isFinite(size) ? size : 0,
    createdAt: timestamp,
    modifiedAt: timestamp,
    parentPath: '/',
  });
  stats.mode = type === 'directory' ? 0o777 : 0o666;
  return stats;
}

function parseEncoding(
  options?: EncOpt | WriteOpt
): BufferEncoding | undefined {
  if (!options) return undefined;
  if (typeof options === 'string') return options;
  return options.encoding ?? undefined;
}

function unsupported(name: string) {
  return async (..._args: unknown[]) => {
    throw new Error(`ENOTSUP: WebDAV does not support ${name}`);
  };
}

function readableError(
  error: unknown,
  operation: string,
  path?: string
): Error {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const hint =
    lower.includes('cors') || lower.includes('failed to fetch')
      ? 'CORS or network failure'
      : lower.includes('401') || lower.includes('403') || lower.includes('auth')
        ? 'authentication failed'
        : 'request failed';
  return new Error(
    `WebDAV ${operation} ${hint}${path ? ` for '${path}'` : ''}: ${message}`
  );
}

async function webdavCall<T>(
  operation: string,
  path: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw readableError(error, operation, path);
  }
}

export const createWebDAVStoragePlugin: FsPluginFactory<
  WebDAVStoragePluginOptions
> = (options, ctx) => {
  const mountPath = options.mountPath ?? '/webdav';
  const remoteRoot = options.remoteRoot ?? '/';
  const headers = { ...(options.headers ?? {}) };
  const clientOptions: {
    authType?: 'auto' | 'digest' | 'none' | 'password' | 'token';
    username?: string;
    password?: string;
    headers?: Record<string, string>;
    fetch?: typeof fetch;
    withCredentials?: boolean;
  } = options.token
    ? {
        headers: { ...headers, Authorization: `Bearer ${options.token}` },
        fetch: options.fetch,
        withCredentials: options.withCredentials,
      }
    : options.username !== undefined || options.password !== undefined
      ? {
          authType: options.authType ?? 'auto',
          username: options.username ?? '',
          password: options.password ?? '',
          headers,
          fetch: options.fetch,
          withCredentials: options.withCredentials,
        }
      : {
          authType: options.authType,
          headers,
          fetch: options.fetch,
          withCredentials: options.withCredentials,
        };

  const client = createClient(options.baseUrl, clientOptions) as WebDAVClient;
  const toRemote = (path: string) => remotePath(remoteRoot, path);

  async function readBinary(path: string): Promise<Uint8Array> {
    const remote = toRemote(path);
    const contents = await webdavCall('readFile', remote, () =>
      client.getFileContents(remote, { format: 'binary' })
    );
    if (contents instanceof Uint8Array) return contents;
    if (contents instanceof ArrayBuffer) return new Uint8Array(contents);
    if (typeof contents === 'string') return ctx.Buffer.fromString(contents);
    return new Uint8Array(contents as ArrayBufferLike);
  }

  function toWriteData(data: Iterable<number>, options?: WriteOpt): Uint8Array {
    if (typeof data === 'string') {
      return ctx.Buffer.fromString(data, parseEncoding(options) || 'utf8');
    }
    if (ctx.Buffer.isBuffer(data) || data instanceof Uint8Array) {
      return new Uint8Array(data);
    }
    return ctx.Buffer.fromString(
      String(data),
      parseEncoding(options) || 'utf8'
    );
  }

  function readdirWebDAV(
    path: string,
    options: { withFileTypes: true; encoding?: BufferEncoding } | BufferEncoding
  ): Promise<Dirent[]>;
  function readdirWebDAV(
    path: string,
    options?:
      | { withFileTypes?: false; encoding?: BufferEncoding }
      | BufferEncoding
  ): Promise<string[]>;
  async function readdirWebDAV(
    path: string,
    options?:
      | { withFileTypes?: boolean; encoding?: BufferEncoding }
      | BufferEncoding
  ): Promise<Array<Dirent | string>> {
    const remote = toRemote(path);
    const contents = await webdavCall('readdir', remote, () =>
      client.getDirectoryContents(remote)
    );
    const entries = Array.isArray(contents) ? contents : [contents];
    if (typeof options === 'object' && options?.withFileTypes) {
      return entries.map(
        (entry) => new Dirent(fileStatName(entry), fileStatType(entry))
      );
    }
    return entries.map(fileStatName);
  }

  return {
    match: new RegExp(`^${escapeRegExp(norm(mountPath))}(/|$)`),
    mountPath,
    handlers: {
      async readFile(path: string, options?: EncOpt) {
        const data = await readBinary(path);
        const encoding = parseEncoding(options);
        return encoding
          ? new ctx.Buffer(data).toString(encoding)
          : new ctx.Buffer(data);
      },
      async writeFile(
        file: string,
        data: Iterable<number>,
        options?: WriteOpt
      ) {
        const remote = toRemote(file);
        await webdavCall('writeFile', remote, () =>
          client.putFileContents(remote, toWriteData(data, options))
        );
      },
      async appendFile(
        file: string,
        data: Iterable<number>,
        options?: WriteOpt
      ) {
        const remote = toRemote(file);
        const existing = await webdavCall('appendFile', remote, async () => {
          const exists = await client.exists(remote);
          return exists ? await readBinary(file) : new Uint8Array();
        });
        await webdavCall('appendFile', remote, () =>
          client.putFileContents(
            remote,
            ctx.Buffer.concat([existing, toWriteData(data, options)])
          )
        );
      },
      readdir: readdirWebDAV,
      async stat(path: string) {
        const remote = toRemote(path);
        return toStats(
          await webdavCall('stat', remote, () => client.stat(remote))
        );
      },
      async lstat(path: string) {
        const remote = toRemote(path);
        return toStats(
          await webdavCall('lstat', remote, () => client.stat(remote))
        );
      },
      async mkdir(path: string) {
        const remote = toRemote(path);
        await webdavCall('mkdir', remote, () => client.createDirectory(remote));
      },
      async rm(path: string) {
        const remote = toRemote(path);
        await webdavCall('rm', remote, () => client.deleteFile(remote));
      },
      async unlink(path: string) {
        const remote = toRemote(path);
        await webdavCall('unlink', remote, () => client.deleteFile(remote));
      },
      async rmdir(path: string) {
        const remote = toRemote(path);
        await webdavCall('rmdir', remote, () => client.deleteFile(remote));
      },
      async rename(from: string, to: string) {
        const remoteFrom = toRemote(from);
        const remoteTo = toRemote(to);
        await webdavCall('rename', `${remoteFrom}' -> '${remoteTo}`, () =>
          client.moveFile(remoteFrom, remoteTo)
        );
      },
      async copyFile(from: string, to: string) {
        const remoteFrom = toRemote(from);
        const remoteTo = toRemote(to);
        await webdavCall('copyFile', `${remoteFrom}' -> '${remoteTo}`, () =>
          client.copyFile(remoteFrom, remoteTo)
        );
      },
      async exists(path: string) {
        const remote = toRemote(path);
        return await webdavCall('exists', remote, () => client.exists(remote));
      },
      async access(path: string) {
        const remote = toRemote(path);
        const exists = await webdavCall('access', remote, () =>
          client.exists(remote)
        );
        if (!exists) {
          throw new Error(
            `ENOENT: no such file or directory, access '${path}'`
          );
        }
      },
      async diskUsage(
        pathOrOptions?: string | { bigint?: boolean },
        options?: { bigint?: boolean }
      ) {
        const opts =
          typeof pathOrOptions === 'object' && pathOrOptions
            ? pathOrOptions
            : options || {};
        if (opts.bigint) return { total: 0n, free: 0n, available: 0n };
        return { total: 0, free: 0, available: 0 };
      },
      symlink: unsupported('symlink'),
      readlink: unsupported('readlink'),
      link: unsupported('link'),
      nlink: unsupported('nlink'),
      watch: unsupported('watch') as never,
      watchFile: unsupported('watchFile') as never,
      unwatchFile: unsupported('unwatchFile') as never,
      createReadStream: unsupported('createReadStream') as never,
      createWriteStream: unsupported('createWriteStream') as never,
      open: unsupported('open'),
      read: unsupported('read'),
      write: unsupported('write'),
      close: unsupported('close'),
    },
  };
};
