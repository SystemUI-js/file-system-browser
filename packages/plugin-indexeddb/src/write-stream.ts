import type { FsPluginContext } from '@system-ui-js/file-system-browser';

type WriteStreamEvents = {
  finish: () => void;
  error: (err: unknown) => void;
};

export function createWriteStreamFactory(
  ctx: FsPluginContext,
  namespaceReady: Promise<unknown>,
  toStoragePath: (path: string) => string
) {
  return (path: string) => {
    const listeners: {
      [K in keyof WriteStreamEvents]: WriteStreamEvents[K][];
    } = {
      finish: [],
      error: [],
    };
    const chunks: Uint8Array[] = [];

    return {
      async write(chunk: Uint8Array | string) {
        chunks.push(
          typeof chunk === 'string'
            ? ctx.Buffer.fromString(chunk)
            : new Uint8Array(chunk)
        );
        return true;
      },
      async end(chunk?: Uint8Array | string) {
        if (chunk !== undefined) await this.write(chunk);
        const size = chunks.reduce((total, item) => total + item.length, 0);
        const data = new Uint8Array(size);
        let offset = 0;
        for (const item of chunks) {
          data.set(item, offset);
          offset += item.length;
        }

        try {
          await namespaceReady;
          await ctx.baseFs.writeFile(toStoragePath(path), data);
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
  };
}
