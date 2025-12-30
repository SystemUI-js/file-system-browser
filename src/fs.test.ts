import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fs, BufferPolyfill, Stats, Dirent, FileEntry, registerPlugin, usePlugin, unregisterPlugin } from './fs';

describe('BufferPolyfill', () => {
  describe('fromString', () => {
    it('should create buffer from UTF-8 string', () => {
      const buf = BufferPolyfill.fromString('hello', 'utf8');
      expect(buf.toString('utf8')).toBe('hello');
    });

    it('should create buffer from base64 string', () => {
      const buf = BufferPolyfill.fromString('aGVsbG8=', 'base64');
      expect(buf.toString('utf8')).toBe('hello');
    });

    it('should throw error for unsupported encoding', () => {
      expect(() => BufferPolyfill.fromString('test', 'invalid')).toThrow('Unsupported encoding: invalid');
    });
  });

  describe('alloc', () => {
    it('should allocate buffer with fill number', () => {
      const buf = BufferPolyfill.alloc(5, 42);
      expect(buf.length).toBe(5);
      expect(Array.from(buf)).toEqual([42, 42, 42, 42, 42]);
    });

    it('should allocate buffer with fill string', () => {
      const buf = BufferPolyfill.alloc(5, 'a', 'utf8');
      expect(buf.toString('utf8')).toBe('aaaaa');
    });

    it('should allocate buffer without fill', () => {
      const buf = BufferPolyfill.alloc(5);
      expect(buf.length).toBe(5);
    });
  });

  describe('concat', () => {
    it('should concatenate buffers', () => {
      const buf1 = BufferPolyfill.fromString('hello', 'utf8');
      const buf2 = BufferPolyfill.fromString(' world', 'utf8');
      const result = BufferPolyfill.concat([buf1, buf2]);
      expect(result.toString('utf8')).toBe('hello world');
    });

    it('should concatenate buffers with totalLength', () => {
      const buf1 = BufferPolyfill.fromString('hello', 'utf8');
      const buf2 = BufferPolyfill.fromString(' world', 'utf8');
      const result = BufferPolyfill.concat([buf1, buf2], 11);
      expect(result.toString('utf8')).toBe('hello world');
      expect(result.length).toBe(11);
    });
  });

  describe('isBuffer', () => {
    it('should identify buffer instances', () => {
      const buf = BufferPolyfill.fromString('test', 'utf8');
      expect(BufferPolyfill.isBuffer(buf)).toBe(true);
    });

    it('should handle Uint8Array', () => {
      expect(BufferPolyfill.isBuffer(new Uint8Array(5))).toBe(true);
    });

    it('should reject non-buffer objects', () => {
      expect(BufferPolyfill.isBuffer({})).toBe(false);
      expect(BufferPolyfill.isBuffer('string')).toBe(false);
    });
  });

  describe('toString', () => {
    it('should convert buffer to UTF-8 string', () => {
      const buf = BufferPolyfill.fromString('hello', 'utf8');
      expect(buf.toString('utf8')).toBe('hello');
    });

    it('should convert buffer to base64 string', () => {
      const buf = BufferPolyfill.fromString('hello', 'utf8');
      expect(buf.toString('base64')).toBe('aGVsbG8=');
    });

    it('should throw error for unsupported encoding', () => {
      const buf = BufferPolyfill.fromString('test', 'utf8');
      expect(() => buf.toString('invalid')).toThrow('Unsupported encoding: invalid');
    });
  });
});

describe('Stats', () => {
  it('should create stats for file', () => {
    const entry: FileEntry = {
      path: '/test',
      name: 'test',
      type: 'file',
      size: 100,
      createdAt: 1000,
      modifiedAt: 2000,
      parentPath: '/',
    };
    const stats = new Stats(entry);
    expect(stats.size).toBe(100);
    expect(stats.mtimeMs).toBe(2000);
    expect(stats.ctimeMs).toBe(1000);
    expect(stats.birthtimeMs).toBe(1000);
    expect(stats.isFile()).toBe(true);
    expect(stats.isDirectory()).toBe(false);
    expect(stats.isSymbolicLink()).toBe(false);
  });

  it('should create stats for directory', () => {
    const entry: FileEntry = {
      path: '/test',
      name: 'test',
      type: 'directory',
      size: 0,
      createdAt: 1000,
      modifiedAt: 2000,
      parentPath: '/',
    };
    const stats = new Stats(entry);
    expect(stats.isFile()).toBe(false);
    expect(stats.isDirectory()).toBe(true);
    expect(stats.isSymbolicLink()).toBe(false);
  });

  it('should create stats for symlink', () => {
    const entry: FileEntry = {
      path: '/test',
      name: 'test',
      type: 'symlink',
      size: 0,
      createdAt: 1000,
      modifiedAt: 2000,
      parentPath: '/',
      linkTarget: '/target',
    };
    const stats = new Stats(entry);
    expect(stats.isFile()).toBe(false);
    expect(stats.isDirectory()).toBe(false);
    expect(stats.isSymbolicLink()).toBe(true);
  });
});

describe('Dirent', () => {
  it('should create dirent for file', () => {
    const dirent = new Dirent('test.txt', 'file');
    expect(dirent.name).toBe('test.txt');
    expect(dirent.isFile()).toBe(true);
    expect(dirent.isDirectory()).toBe(false);
    expect(dirent.isSymbolicLink()).toBe(false);
  });

  it('should create dirent for directory', () => {
    const dirent = new Dirent('test', 'directory');
    expect(dirent.name).toBe('test');
    expect(dirent.isFile()).toBe(false);
    expect(dirent.isDirectory()).toBe(true);
    expect(dirent.isSymbolicLink()).toBe(false);
  });

  it('should create dirent for symlink', () => {
    const dirent = new Dirent('test', 'symlink');
    expect(dirent.name).toBe('test');
    expect(dirent.isFile()).toBe(false);
    expect(dirent.isDirectory()).toBe(false);
    expect(dirent.isSymbolicLink()).toBe(true);
  });
});

describe('Plugin System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registerPlugin', () => {
    it('should throw error when plugin name is empty', () => {
      const pluginFactory = vi.fn();

      expect(() => registerPlugin('', pluginFactory)).toThrow('插件名不能为空');
    });
  });

  describe('usePlugin', () => {
    it('should use registered plugin', () => {
      const handlers = {
        readFile: vi.fn().mockResolvedValue('plugin data'),
      };

      registerPlugin('test-plugin', () => ({
        match: /^\/test/,
        handlers,
      }));

      const plugin = usePlugin('test-plugin', {});

      expect(plugin.name).toBe('test-plugin');
      expect(plugin.match).toEqual(/^\/test/);
      expect(plugin.handlers).toEqual(handlers);
    });

    it('should throw error when plugin not found', () => {
      expect(() => usePlugin('nonexistent', {})).toThrow(
        '未找到名为 nonexistent 的插件，请先注册后再使用'
      );
    });
  });

  describe('unregisterPlugin', () => {
    it('should exist and be callable', () => {
      expect(unregisterPlugin).toBeDefined();
      expect(typeof unregisterPlugin).toBe('function');
    });
  });
});

describe('Watch APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('watch', () => {
    it('should create watcher', () => {
      const watcher = fs.watch('/test');
      expect(watcher).toHaveProperty('close');
    });

    it('should create watcher with listener', () => {
      const listener = vi.fn();
      const watcher = fs.watch('/test', listener);
      expect(watcher).toHaveProperty('close');
    });
  });

  describe('watchFile', () => {
    it('should watch file', () => {
      const listener = vi.fn();
      fs.watchFile('/test', listener);
      expect(listener).toBeDefined();
    });
  });

  describe('unwatchFile', () => {
    it('should unwatch file', () => {
      const listener = vi.fn();
      fs.watchFile('/test', listener);
      fs.unwatchFile('/test', listener);
    });
  });
});

describe('Stream APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createReadStream', () => {
    it('should create read stream', () => {
      const stream = fs.createReadStream('/test');
      expect(stream).toHaveProperty('on');
      expect(stream).toHaveProperty('pipe');
      expect(stream).toHaveProperty('close');
    });
  });

  describe('createWriteStream', () => {
    it('should create write stream', () => {
      const stream = fs.createWriteStream('/test');
      expect(stream).toHaveProperty('write');
      expect(stream).toHaveProperty('end');
      expect(stream).toHaveProperty('on');
    });
  });
});

describe('fs.constants', () => {
  it('should have file access constants', () => {
    expect(fs.constants).toHaveProperty('F_OK', 0);
    expect(fs.constants).toHaveProperty('R_OK', 4);
    expect(fs.constants).toHaveProperty('W_OK', 2);
    expect(fs.constants).toHaveProperty('X_OK', 1);
  });
});

describe('fs.promises - basic properties', () => {
  it('should have all expected methods', () => {
    const methods = [
      'readFile',
      'writeFile',
      'appendFile',
      'rename',
      'copyFile',
      'mkdir',
      'readdir',
      'rm',
      'unlink',
      'rmdir',
      'stat',
      'lstat',
      'readlink',
      'symlink',
      'link',
      'exists',
      'access',
      'nlink',
      'open',
      'read',
      'write',
      'close',
      'requestPersistentStorage',
      'diskUsage',
    ];

    for (const method of methods) {
      expect(fs.promises).toHaveProperty(method);
      expect(typeof fs.promises[method as keyof typeof fs.promises]).toBe('function');
    }
  });
});
