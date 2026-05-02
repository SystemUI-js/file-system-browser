import { BufferPolyfill, Dirent, type FsPluginContext } from './fs';
import { createIndexedDBStoragePlugin, createMemoryStoragePlugin, fs, registerPlugin, unregisterPlugin, usePlugin } from './index';

describe('plugin system', () => {
  const cleanupPluginNames = [
    'indexeddb',
    'test-plugin',
    'another-plugin',
    'pluginA',
    'pluginB',
    'mounted',
    'same-mounted',
    'mounted-indexeddb',
    'catch-all',
    'prefix-mounted',
    'memory',
  ];

  const cleanupPlugins = () => {
    for (const name of cleanupPluginNames) {
      try { unregisterPlugin(name); } catch { /* noop */ }
    }
  };

  beforeEach(() => {
    cleanupPlugins();
  });

  afterEach(() => {
    cleanupPlugins();
  });

  describe('no implicit mount', () => {
    it('should throw when writing without a mounted plugin', async () => {
      let thrown = false;
      let errorMessage = '';
      try {
        await fs.promises.writeFile('/test.txt', 'hello', 'utf8');
      } catch (err: unknown) {
        thrown = true;
        errorMessage = err instanceof Error ? err.message : String(err);
      }
      expect(thrown).toBe(true);
      expect(errorMessage).toBe('No storage plugin mounted for this path');
    });

    it('should throw when reading without a mounted plugin', async () => {
      let thrown = false;
      let errorMessage = '';
      try {
        await fs.promises.readFile('/test.txt', 'utf8');
      } catch (err: unknown) {
        thrown = true;
        errorMessage = err instanceof Error ? err.message : String(err);
      }
      expect(thrown).toBe(true);
      expect(errorMessage).toBe('No storage plugin mounted for this path');
    });

    it('should throw when mkdir without a mounted plugin', async () => {
      let thrown = false;
      let errorMessage = '';
      try {
        await fs.promises.mkdir('/testdir', { recursive: true });
      } catch (err: unknown) {
        thrown = true;
        errorMessage = err instanceof Error ? err.message : String(err);
      }
      expect(thrown).toBe(true);
      expect(errorMessage).toBe('No storage plugin mounted for this path');
    });
  });

  describe('plugin lifecycle', () => {
    it('registerPlugin should work with indexeddb storage plugin', () => {
      expect(() => {
        registerPlugin('indexeddb', createIndexedDBStoragePlugin);
      }).not.toThrow();
    });

    it('usePlugin should mount the plugin', () => {
      registerPlugin('indexeddb', createIndexedDBStoragePlugin);
      expect(() => {
        usePlugin('indexeddb', {});
      }).not.toThrow();
    });

    it('after mounting, writeFile should work', async () => {
      registerPlugin('indexeddb', createIndexedDBStoragePlugin);
      usePlugin('indexeddb', {});
      await fs.promises.writeFile('/test.txt', 'hello world', 'utf8');
      const content = await fs.promises.readFile('/test.txt', 'utf8');
      expect(content).toBe('hello world');
    });

    it('after mounting, readFile should work', async () => {
      registerPlugin('indexeddb', createIndexedDBStoragePlugin);
      usePlugin('indexeddb', {});
      await fs.promises.writeFile('/readtest.txt', 'test content', 'utf8');
      const content = await fs.promises.readFile('/readtest.txt', 'utf8');
      expect(content).toBe('test content');
    });

    it('after mounting, mkdir should work', async () => {
      registerPlugin('indexeddb', createIndexedDBStoragePlugin);
      usePlugin('indexeddb', {});
      await fs.promises.mkdir('/testdir', { recursive: true });
      const exists = await fs.promises.stat('/testdir');
      expect(exists.isDirectory()).toBe(true);
    });

    it('after mounting, readdir should work', async () => {
      registerPlugin('indexeddb', createIndexedDBStoragePlugin);
      usePlugin('indexeddb', {});
      await fs.promises.mkdir('/readdirtest', { recursive: true });
      await fs.promises.writeFile('/readdirtest/a.txt', 'a', 'utf8');
      await fs.promises.writeFile('/readdirtest/b.txt', 'b', 'utf8');
      const entries = await fs.promises.readdir('/readdirtest');
      expect(entries.sort()).toEqual(['a.txt', 'b.txt']);
    });

    it('after mounting, rm should work', async () => {
      registerPlugin('indexeddb', createIndexedDBStoragePlugin);
      usePlugin('indexeddb', {});
      await fs.promises.writeFile('/rmtest.txt', 'to be deleted', 'utf8');
      await fs.promises.rm('/rmtest.txt');
      let thrown = false;
      try {
        await fs.promises.stat('/rmtest.txt');
      } catch {
        thrown = true;
      }
      expect(thrown).toBe(true);
    });

    it('unregisterPlugin should remove the plugin', async () => {
      registerPlugin('indexeddb', createIndexedDBStoragePlugin);
      usePlugin('indexeddb', {});
      await fs.promises.writeFile('/unregtest.txt', 'hello', 'utf8');
      unregisterPlugin('indexeddb');

      let thrown = false;
      try {
        await fs.promises.writeFile('/unregtest2.txt', 'hello', 'utf8');
      } catch (err: unknown) {
        thrown = true;
        expect(err instanceof Error ? err.message : String(err)).toBe('No storage plugin mounted for this path');
      }
      expect(thrown).toBe(true);
    });
  });

  describe('promise and callback compatibility', () => {
    beforeEach(() => {
      registerPlugin('indexeddb', createIndexedDBStoragePlugin);
      usePlugin('indexeddb', {});
    });

    it('fs.promises.writeFile should work (Promise path)', async () => {
      await fs.promises.writeFile('/promises_write.txt', 'promise write test', 'utf8');
      const content = await fs.promises.readFile('/promises_write.txt', 'utf8');
      expect(content).toBe('promise write test');
    });

    it('fs.promises.readFile should work (Promise path)', async () => {
      await fs.promises.writeFile('/promises_read.txt', 'promise read test', 'utf8');
      const content = await fs.promises.readFile('/promises_read.txt', 'utf8');
      expect(content).toBe('promise read test');
    });

    it('fs.writeFile should work with callback (error-first path)', async () => {
      await new Promise<void>((resolve, reject) => {
        fs.writeFile('/callback_write.txt', 'callback write test', 'utf8', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      const content = await new Promise<string>((resolve, reject) => {
        fs.readFile('/callback_write.txt', 'utf8', (err, data) => {
          if (err) reject(err);
          else resolve(data as string);
        });
      });
      expect(content).toBe('callback write test');
    });

    it('fs.readFile should work with callback (error-first path)', async () => {
      await new Promise<void>((resolve, reject) => {
        fs.writeFile('/callback_read.txt', 'callback read test', 'utf8', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      const content = await new Promise<string>((resolve, reject) => {
        fs.readFile('/callback_read.txt', 'utf8', (err, data) => {
          if (err) reject(err);
          else resolve(data as string);
        });
      });
      expect(content).toBe('callback read test');
    });
  });

  describe('FD routing', () => {
    beforeEach(() => {
      registerPlugin('indexeddb', createIndexedDBStoragePlugin);
      usePlugin('indexeddb', {});
    });

    it('open, write via fd, read via fd, close should work', async () => {
      const handle = await fs.promises.open('/fd_test.txt', 'w');

      await handle.write(BufferPolyfill.fromString('hello fd'));
      await handle.close();

      const readHandle = await fs.promises.open('/fd_test.txt', 'r');
      const readFd = readHandle.fd;

      const buf = new Uint8Array(100);
      const result = await fs.promises.read(readFd, buf, 0, buf.length, 0);
      const content = new TextDecoder().decode(buf.subarray(0, result.bytesRead));

      await readHandle.close();

      expect(content).toBe('hello fd');
    });

    it('fs.open/fs.read/fs.write/fs.close callback style should work', async () => {
      const writeFd = await new Promise<number>((resolve, reject) => {
        fs.open('/fd_callback.txt', 'w', (err, fd) => {
          if (err) reject(err);
          else resolve(fd as number);
        });
      });

      await new Promise<void>((resolve, reject) => {
        fs.write(writeFd, BufferPolyfill.fromString('callback fd content'), 0, undefined, undefined, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      await new Promise<void>((resolve, reject) => {
        fs.close(writeFd, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const readFd = await new Promise<number>((resolve, reject) => {
        fs.open('/fd_callback.txt', 'r', (err, fd) => {
          if (err) reject(err);
          else resolve(fd as number);
        });
      });

      const buf = BufferPolyfill.alloc(100);
      const bytesRead = await new Promise<number>((resolve, reject) => {
        fs.read(readFd, buf, 0, buf.length, 0, (err, bytes) => {
          if (err) reject(err);
          else resolve(bytes as number);
        });
      });

      await new Promise<void>((resolve, reject) => {
        fs.close(readFd, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const content = buf.subarray(0, bytesRead).toString('utf8');
      expect(content).toBe('callback fd content');
    });
  });

  describe('failure paths', () => {
    it('registerPlugin with empty name should throw', () => {
      expect(() => {
        registerPlugin('', createIndexedDBStoragePlugin);
      }).toThrow('插件名不能为空');
    });

    it('usePlugin with unregistered name should throw', () => {
      expect(() => {
        usePlugin('nonexistent', {});
      }).toThrow('未找到名为 nonexistent 的插件，请先注册后再使用');
    });

    it('validates memory plugin mount paths through core rules', () => {
      registerPlugin('memory', createMemoryStoragePlugin);

      expect(() => usePlugin('memory', { mountPath: '' })).toThrow('Invalid plugin mount path: ');
      expect(() => usePlugin('memory', { mountPath: '/' })).toThrow('Invalid plugin mount path: /');
      expect(() => usePlugin('memory', { mountPath: '/memory/' })).toThrow(
        'Invalid plugin mount path: /memory/'
      );
    });

    it('mounted plugin shadows catch-all plugin for its mount prefix', async () => {
      registerPlugin('catch-all', (_opts, ctx: FsPluginContext) => ({
        match: /^\//,
        handlers: {
          async readFile(path: string, options?: unknown) {
            const content = `catch-all:${path}`;
            return options ? content : ctx.Buffer.fromString(content);
          },
        },
      }));
      registerPlugin('prefix-mounted', (_opts, ctx: FsPluginContext) => ({
        match: /^\/cloud(?:\/|$)/,
        mountPath: '/cloud',
        handlers: {
          async readFile(path: string, options?: unknown) {
            const content = `mounted:${path}`;
            return options ? content : ctx.Buffer.fromString(content);
          },
        },
      }));

      usePlugin('catch-all', {});
      usePlugin('prefix-mounted', {});

      await expect(fs.promises.readFile('/cloud/file.txt', 'utf8')).resolves.toBe('mounted:/file.txt');
      await expect(fs.promises.readFile('/outside.txt', 'utf8')).resolves.toBe('catch-all:/outside.txt');
    });
  });

  describe('mount-aware routing', () => {
    const registerMountedPlugin = (name = 'mounted') => {
      registerPlugin<{
        mountPath: string;
        label: string;
      }>(name, (opts, ctx) => ({
        match: /^\/legacy-only(?:\/|$)/,
        mountPath: opts.mountPath,
        handlers: {
          async readFile(path: string, options?: unknown) {
            const content = `${opts.label}:${path}`;
            return options ? content : ctx.Buffer.fromString(content);
          },
          async readdir(path: string, options?: { withFileTypes?: boolean }) {
            if (options?.withFileTypes) {
              return [new Dirent('local.txt', 'file')];
            }
            return [`${opts.label}:${path}`];
          },
          async stat() {
            return ctx.baseFs.stat('/');
          },
          async lstat() {
            return ctx.baseFs.lstat('/');
          },
          async exists() {
            return true;
          },
          async access() {},
          async rename() {},
          async copyFile() {},
          async link() {},
        },
      }));
    };

    it('longest mounted prefix wins, including nested mounts', async () => {
      registerMountedPlugin();
      usePlugin('mounted', { mountPath: '/webdav', label: 'outer' });
      usePlugin('mounted', { mountPath: '/webdav/nested', label: 'inner' });

      await expect(fs.promises.readFile('/webdav/a.txt', 'utf8')).resolves.toBe('outer:/a.txt');
      await expect(fs.promises.readFile('/webdav/nested/a.txt', 'utf8')).resolves.toBe('inner:/a.txt');
    });

    it('strips the mounted prefix exactly once before dispatching to handlers', async () => {
      registerMountedPlugin();
      usePlugin('mounted', { mountPath: '/webdav', label: 'outer' });

      await expect(fs.promises.readFile('/webdav/webdav/file.txt', 'utf8')).resolves.toBe('outer:/webdav/file.txt');
    });

    it('rejects cross-mount mutation by mountId', async () => {
      registerMountedPlugin();
      usePlugin('mounted', { mountPath: '/one', label: 'one' });
      usePlugin('mounted', { mountPath: '/two', label: 'two' });

      const message = '路径同时匹配到多个不同的插件，请检查拦截规则';

      await expect(async () => fs.promises.rename('/one/a.txt', '/two/a.txt')).rejects.toThrow(message);
      await expect(async () => fs.promises.copyFile('/one/a.txt', '/two/a.txt')).rejects.toThrow(message);
      await expect(async () => fs.promises.link('/one/a.txt', '/two/a.txt')).rejects.toThrow(message);
    });

    it('allows same plugin name mounted at different paths to coexist', async () => {
      registerMountedPlugin('same-mounted');
      usePlugin('same-mounted', { mountPath: '/alpha', label: 'alpha' });
      usePlugin('same-mounted', { mountPath: '/beta', label: 'beta' });

      await expect(fs.promises.readFile('/alpha/file.txt', 'utf8')).resolves.toBe('alpha:/file.txt');
      await expect(fs.promises.readFile('/beta/file.txt', 'utf8')).resolves.toBe('beta:/file.txt');
      await expect(fs.promises.readdir('/alpha/folder')).resolves.toEqual(['alpha:/folder']);
      await expect(fs.promises.readdir('/beta')).resolves.toEqual(['beta:/']);

      const entries = await fs.promises.readdir('/');
      expect(entries).toContain('alpha');
      expect(entries).toContain('beta');
    });

    it('does not match sibling prefixes as mounted descendants', async () => {
      registerMountedPlugin();
      usePlugin('mounted', { mountPath: '/webdav', label: 'outer' });

      await expect(async () => fs.promises.readFile('/webdav2/file.txt', 'utf8')).rejects.toThrow('No storage plugin mounted for this path');
    });

    it('keeps legacy usePlugin without mountPath working', async () => {
      registerPlugin('indexeddb', createIndexedDBStoragePlugin);
      usePlugin('indexeddb', {});

      await fs.promises.writeFile('/legacy-still-works.txt', 'ok', 'utf8');
      await expect(fs.promises.readFile('/legacy-still-works.txt', 'utf8')).resolves.toBe('ok');
    });

    it('lists mounted roots at virtual root with base entries', async () => {
      registerPlugin('indexeddb', createIndexedDBStoragePlugin);
      usePlugin('indexeddb', {});
      await fs.promises.writeFile('/base-root.txt', 'base', 'utf8');

      registerMountedPlugin();
      usePlugin('mounted', { mountPath: '/webdav', label: 'outer' });

      const entries = await fs.promises.readdir('/');
      expect(entries).toContain('base-root.txt');
      expect(entries).toContain('webdav');

      const stat = await fs.promises.stat('/webdav');
      expect(stat.isDirectory()).toBe(true);
      await expect(async () => fs.promises.mkdir('/webdav')).rejects.toThrow('EBUSY');
      await expect(async () => fs.promises.rm('/webdav')).rejects.toThrow('EBUSY');
    });

    it('mounted indexeddb plugin with mountPath works correctly', async () => {
      registerPlugin('indexeddb', createIndexedDBStoragePlugin);
      usePlugin('indexeddb', { mountPath: '/indexeddb' });

      // Write to mounted path - should store at plugin-local /file.txt
      await fs.promises.writeFile('/indexeddb/file.txt', 'indexeddb content', 'utf8');

      // Read back from mounted path
      const content = await fs.promises.readFile('/indexeddb/file.txt', 'utf8');
      expect(content).toBe('indexeddb content');

      // Verify root listing includes 'indexeddb' as a mounted entry
      const entries = await fs.promises.readdir('/');
      expect(entries).toContain('indexeddb');

      // Verify the mounted root is a directory
      const stat = await fs.promises.stat('/indexeddb');
      expect(stat.isDirectory()).toBe(true);

      // Cannot mutate mount root itself
      await expect(async () => fs.promises.mkdir('/indexeddb')).rejects.toThrow('EBUSY');
      await expect(async () => fs.promises.rm('/indexeddb')).rejects.toThrow('EBUSY');
    });

    it('legacy indexeddb without mountPath still works', async () => {
      registerPlugin('indexeddb', createIndexedDBStoragePlugin);
      usePlugin('indexeddb', {});

      await fs.promises.writeFile('/legacy-test.txt', 'legacy ok', 'utf8');
      const content = await fs.promises.readFile('/legacy-test.txt', 'utf8');
      expect(content).toBe('legacy ok');

      // Root listing should not contain 'indexeddb' as a mount point
      const entries = await fs.promises.readdir('/');
      expect(entries).not.toContain('indexeddb');
    });
  });
});
