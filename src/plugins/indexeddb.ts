import type { FsPluginFactory, FsPluginContext } from '../fs';

export interface IndexedDBStoragePluginOptions {
  mountPath?: string;
}

export const createIndexedDBStoragePlugin: FsPluginFactory<IndexedDBStoragePluginOptions> = (
  options,
  ctx: FsPluginContext
) => ({
  match: /^\/(?:.*)$/,
  mountPath: options.mountPath,
  handlers: {
    readFile: ctx.baseFs.readFile,
    writeFile: ctx.baseFs.writeFile,
    appendFile: ctx.baseFs.appendFile,
    rename: ctx.baseFs.rename,
    copyFile: ctx.baseFs.copyFile,
    mkdir: ctx.baseFs.mkdir,
    readdir: ctx.baseFs.readdir,
    rm: ctx.baseFs.rm,
    unlink: ctx.baseFs.unlink,
    rmdir: ctx.baseFs.rmdir,
    stat: ctx.baseFs.stat,
    lstat: ctx.baseFs.lstat,
    readlink: ctx.baseFs.readlink,
    symlink: ctx.baseFs.symlink,
    link: ctx.baseFs.link,
    exists: ctx.baseFs.exists,
    access: ctx.baseFs.access,
    nlink: ctx.baseFs.nlink,
    open: ctx.baseFs.open,
    read: ctx.baseFs.read,
    write: ctx.baseFs.write,
    close: ctx.baseFs.close,
    watch: ctx.baseWatch,
    watchFile: ctx.baseWatchFile,
    unwatchFile: ctx.baseUnwatchFile,
    createReadStream: ctx.baseCreateReadStream,
    createWriteStream: ctx.baseCreateWriteStream,
  },
});