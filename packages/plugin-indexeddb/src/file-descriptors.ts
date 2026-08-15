import type { FsPluginContext } from '@system-ui-js/file-system-browser';

export function createFileDescriptorHandlers(
  ctx: FsPluginContext,
  namespaceReady: Promise<unknown>,
  toStoragePath: (path: string) => string
) {
  const openHandles = new Map<
    number,
    Awaited<ReturnType<FsPluginContext['baseFs']['open']>>
  >();

  const getHandle = (fd: number, operation: string) => {
    const handle = openHandles.get(fd);
    if (!handle) throw new Error(`EBADF: bad file descriptor, ${operation}`);
    return handle;
  };

  const close = async (fd: number) => {
    const handle = getHandle(fd, 'close');
    openHandles.delete(fd);
    ctx.releaseFd(fd);
    await handle.close();
  };

  return {
    getStorageFd(fd: number, operation: string) {
      return getHandle(fd, operation).fd;
    },
    handlers: {
      async open(path: string, flags: string, mode?: number) {
        await namespaceReady;
        const storageHandle = await ctx.baseFs.open(
          toStoragePath(path),
          flags,
          mode
        );
        const fd = ctx.createFd(path, flags);
        openHandles.set(fd, storageHandle);
        return {
          fd,
          close: () => close(fd),
          read(
            buffer: Uint8Array,
            offset: number,
            length: number,
            position: number | null
          ) {
            return getHandle(fd, 'read').read(buffer, offset, length, position);
          },
          write(
            buffer: Uint8Array | string,
            offset?: number,
            length?: number,
            position?: number | null
          ) {
            return getHandle(fd, 'write').write(
              buffer,
              offset,
              length,
              position
            );
          },
        };
      },
      read(
        fd: number,
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number | null
      ) {
        return getHandle(fd, 'read').read(buffer, offset, length, position);
      },
      write(
        fd: number,
        buffer: Uint8Array | string,
        offset?: number,
        length?: number,
        position?: number | null
      ) {
        return getHandle(fd, 'write').write(buffer, offset, length, position);
      },
      close,
    },
  };
}
