import type {
  BufferEncoding,
  Dirent,
  FsPluginContext,
  FsPluginFactory,
} from '@system-ui-js/file-system-browser';
import { createFileDescriptorHandlers } from './file-descriptors';
import { createWriteStreamFactory } from './write-stream';

export interface IndexedDBStoragePluginOptions {
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

function norm(path: string): string {
  const absolute = path.startsWith('/') ? path : `/${path}`;
  return absolute !== '/' && absolute.endsWith('/')
    ? absolute.slice(0, -1)
    : absolute;
}

export const createIndexedDBStoragePlugin: FsPluginFactory<
  IndexedDBStoragePluginOptions
> = (options, ctx: FsPluginContext) => {
  const namespaceKey = norm(options.mountPath ?? '/');
  const namespace = `/.fs-plugin-indexeddb/${encodeURIComponent(namespaceKey)}`;
  const namespaceReady = ctx.baseFs.mkdir(namespace, { recursive: true });
  const toStoragePath = (path: string) => {
    const local = norm(path);
    return local === '/' ? namespace : `${namespace}${local}`;
  };
  const toLocalTarget = (target: string) => {
    const normalized = norm(target);
    if (namespaceKey === '/') return normalized;
    if (normalized === namespaceKey) return '/';
    if (normalized.startsWith(`${namespaceKey}/`)) {
      return normalized.slice(namespaceKey.length);
    }
    return normalized;
  };
  const toPublicTarget = (target: string) => {
    if (target === namespace) return '/';
    return target.startsWith(`${namespace}/`)
      ? target.slice(namespace.length)
      : target;
  };
  const createWriteStream = createWriteStreamFactory(
    ctx,
    namespaceReady,
    toStoragePath
  );
  const fileDescriptorHandlers = createFileDescriptorHandlers(
    ctx,
    namespaceReady,
    toStoragePath
  );
  function readdirIndexedDB(
    path: string,
    readdirOptions:
      | {
          withFileTypes: true;
          encoding?: BufferEncoding;
        }
      | BufferEncoding
  ): Promise<Dirent[]>;
  function readdirIndexedDB(
    path: string,
    readdirOptions?:
      | {
          withFileTypes?: false;
          encoding?: BufferEncoding;
        }
      | BufferEncoding
  ): Promise<string[]>;
  async function readdirIndexedDB(
    path: string,
    readdirOptions?:
      | { withFileTypes?: boolean; encoding?: BufferEncoding }
      | BufferEncoding
  ): Promise<Array<Dirent | string>> {
    await namespaceReady;
    if (
      typeof readdirOptions === 'object' &&
      readdirOptions.withFileTypes === true
    ) {
      return ctx.baseFs.readdir(toStoragePath(path), {
        withFileTypes: true,
        encoding: readdirOptions.encoding,
      });
    }
    const namesOptions =
      typeof readdirOptions === 'object'
        ? {
            withFileTypes: false as const,
            encoding: readdirOptions.encoding,
          }
        : readdirOptions;
    return ctx.baseFs.readdir(toStoragePath(path), namesOptions);
  }

  return {
    match: /^\/(?:.*)$/,
    mountPath: options.mountPath,
    handlers: {
      async readFile(path: string | number, readOptions?: EncOpt) {
        await namespaceReady;
        const storagePath =
          typeof path === 'number'
            ? fileDescriptorHandlers.getStorageFd(path, 'readFile')
            : toStoragePath(path);
        return ctx.baseFs.readFile(storagePath, readOptions);
      },
      async writeFile(
        path: string | number,
        data: Iterable<number>,
        writeOptions?: WriteOpt
      ) {
        await namespaceReady;
        const storagePath =
          typeof path === 'number'
            ? fileDescriptorHandlers.getStorageFd(path, 'writeFile')
            : toStoragePath(path);
        await ctx.baseFs.writeFile(storagePath, data, writeOptions);
      },
      async appendFile(
        path: string | number,
        data: Iterable<number>,
        writeOptions?: WriteOpt
      ) {
        await namespaceReady;
        const storagePath =
          typeof path === 'number'
            ? fileDescriptorHandlers.getStorageFd(path, 'appendFile')
            : toStoragePath(path);
        await ctx.baseFs.appendFile(storagePath, data, writeOptions);
      },
      async rename(from: string, to: string) {
        await namespaceReady;
        await ctx.baseFs.rename(toStoragePath(from), toStoragePath(to));
      },
      async copyFile(from: string, to: string) {
        await namespaceReady;
        await ctx.baseFs.copyFile(toStoragePath(from), toStoragePath(to));
      },
      async mkdir(path: string, mkdirOptions) {
        await namespaceReady;
        await ctx.baseFs.mkdir(toStoragePath(path), mkdirOptions);
      },
      readdir: readdirIndexedDB,
      async rm(path: string, rmOptions) {
        await namespaceReady;
        await ctx.baseFs.rm(toStoragePath(path), rmOptions);
      },
      async unlink(path: string) {
        await namespaceReady;
        await ctx.baseFs.unlink(toStoragePath(path));
      },
      async rmdir(path: string, rmdirOptions) {
        await namespaceReady;
        await ctx.baseFs.rmdir(toStoragePath(path), rmdirOptions);
      },
      async stat(path: string) {
        await namespaceReady;
        return ctx.baseFs.stat(toStoragePath(path));
      },
      async lstat(path: string) {
        await namespaceReady;
        return ctx.baseFs.lstat(toStoragePath(path));
      },
      async readlink(path: string) {
        await namespaceReady;
        return toPublicTarget(await ctx.baseFs.readlink(toStoragePath(path)));
      },
      async symlink(target: string, path: string) {
        await namespaceReady;
        await ctx.baseFs.symlink(
          toStoragePath(toLocalTarget(target)),
          toStoragePath(path)
        );
      },
      async link(existingPath: string, newPath: string) {
        await namespaceReady;
        await ctx.baseFs.link(
          toStoragePath(existingPath),
          toStoragePath(newPath)
        );
      },
      async exists(path: string) {
        await namespaceReady;
        return ctx.baseFs.exists(toStoragePath(path));
      },
      async access(path: string, mode?: number) {
        await namespaceReady;
        await ctx.baseFs.access(toStoragePath(path), mode);
      },
      async nlink(path: string) {
        await namespaceReady;
        return ctx.baseFs.nlink(toStoragePath(path));
      },
      ...fileDescriptorHandlers.handlers,
      watch(path, listener) {
        return ctx.baseWatch(toStoragePath(path), listener);
      },
      watchFile(path, listener) {
        ctx.baseWatchFile(toStoragePath(path), listener);
      },
      unwatchFile(path, listener) {
        ctx.baseUnwatchFile(toStoragePath(path), listener);
      },
      createReadStream(path, streamOptions) {
        return ctx.baseCreateReadStream(toStoragePath(path), streamOptions);
      },
      createWriteStream,
    },
  };
};
