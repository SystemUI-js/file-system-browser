import {
  Buffer,
  createMemoryStoragePlugin,
  fs,
  registerPlugin,
  unregisterPlugin,
  usePlugin,
} from './index';

describe('memory storage plugin', () => {
  const cleanup = () => {
    try {
      unregisterPlugin('memory');
    } catch {
      /* noop */
    }
  };

  const mountMemory = (mountPath = '/memory') => {
    registerPlugin('memory', createMemoryStoragePlugin);
    usePlugin('memory', { mountPath });
  };

  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it('supports file CRUD and clones caller-provided bytes', async () => {
    mountMemory();

    await fs.promises.writeFile('/memory/file.txt', 'hello', 'utf8');
    await expect(fs.promises.readFile('/memory/file.txt', 'utf8')).resolves.toBe('hello');

    await fs.promises.appendFile('/memory/file.txt', ' world', 'utf8');
    await expect(fs.promises.readFile('/memory/file.txt', 'utf8')).resolves.toBe('hello world');

    const bytes = new Uint8Array([65, 66, 67]);
    await fs.promises.writeFile('/memory/bytes.bin', bytes);
    bytes[0] = 90;
    const stored = (await fs.promises.readFile('/memory/bytes.bin')) as Buffer;
    expect(Array.from(stored)).toEqual([65, 66, 67]);

    await expect(fs.promises.exists('/memory/file.txt')).resolves.toBe(true);
    await expect(fs.promises.access('/memory/file.txt')).resolves.toBeUndefined();
    const stat = await fs.promises.stat('/memory/file.txt');
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBe('hello world'.length);

    await fs.promises.unlink('/memory/file.txt');
    await expect(fs.promises.readFile('/memory/file.txt', 'utf8')).rejects.toThrow('ENOENT');
  });

  it('supports directory CRUD and recursive mkdir/rm', async () => {
    mountMemory();

    await fs.promises.mkdir('/memory/a/b/c', { recursive: true });
    await fs.promises.writeFile('/memory/a/b/c/file.txt', 'nested', 'utf8');

    const names = await fs.promises.readdir('/memory/a/b/c');
    expect(names).toEqual(['file.txt']);

    const dirents = await fs.promises.readdir('/memory/a/b', { withFileTypes: true });
    expect(dirents[0].name).toBe('c');
    expect(dirents[0].isDirectory()).toBe(true);

    await expect(fs.promises.rm('/memory/a')).rejects.toThrow('ENOTEMPTY');
    await fs.promises.rm('/memory/a', { recursive: true });
    await expect(fs.promises.exists('/memory/a/b/c/file.txt')).resolves.toBe(false);

    await fs.promises.mkdir('/memory/empty');
    await fs.promises.rmdir('/memory/empty');
    await expect(fs.promises.stat('/memory/empty')).rejects.toThrow('ENOENT');
  });

  it('supports rename and copyFile', async () => {
    mountMemory();

    await fs.promises.mkdir('/memory/docs');
    await fs.promises.writeFile('/memory/docs/source.txt', 'source', 'utf8');
    await fs.promises.rename('/memory/docs/source.txt', '/memory/docs/renamed.txt');

    await expect(fs.promises.readFile('/memory/docs/source.txt', 'utf8')).rejects.toThrow('ENOENT');
    await expect(fs.promises.readFile('/memory/docs/renamed.txt', 'utf8')).resolves.toBe('source');

    await fs.promises.copyFile('/memory/docs/renamed.txt', '/memory/docs/copy.txt');
    await fs.promises.writeFile('/memory/docs/copy.txt', 'copy', 'utf8');
    await expect(fs.promises.readFile('/memory/docs/renamed.txt', 'utf8')).resolves.toBe('source');
    await expect(fs.promises.readFile('/memory/docs/copy.txt', 'utf8')).resolves.toBe('copy');
  });

  it('supports symlink/readlink and detects symlink loops', async () => {
    mountMemory();

    await fs.promises.writeFile('/memory/target.txt', 'target', 'utf8');
    await fs.promises.symlink('/memory/target.txt', '/memory/link.txt');

    await expect(fs.promises.readlink('/memory/link.txt')).resolves.toBe('/target.txt');
    expect((await fs.promises.lstat('/memory/link.txt')).isSymbolicLink()).toBe(true);
    expect((await fs.promises.stat('/memory/link.txt')).isFile()).toBe(true);
    await expect(fs.promises.readFile('/memory/link.txt', 'utf8')).resolves.toBe('target');

    await fs.promises.symlink('/memory/loop-b', '/memory/loop-a');
    await fs.promises.symlink('/memory/loop-a', '/memory/loop-b');
    await expect(fs.promises.stat('/memory/loop-a')).rejects.toThrow('ELOOP');
  });

  it('supports hard links and nlink', async () => {
    mountMemory();

    await fs.promises.writeFile('/memory/original.txt', 'one', 'utf8');
    await fs.promises.link('/memory/original.txt', '/memory/hard.txt');

    await expect(fs.promises.nlink('/memory/original.txt')).resolves.toBe(2);
    await expect(fs.promises.nlink('/memory/hard.txt')).resolves.toBe(2);

    await fs.promises.writeFile('/memory/hard.txt', 'two', 'utf8');
    await expect(fs.promises.readFile('/memory/original.txt', 'utf8')).resolves.toBe('two');
  });

  it('supports open/read/write/close and fd-level methods', async () => {
    mountMemory();

    const handle = await fs.promises.open('/memory/fd.txt', 'w');
    await handle.write('hello fd');
    await handle.close();

    const readHandle = await fs.promises.open('/memory/fd.txt', 'r');
    const buffer = Buffer.alloc(32);
    const result = await fs.promises.read(readHandle.fd, buffer, 0, buffer.length, 0);
    await fs.promises.close(readHandle.fd);

    expect(buffer.subarray(0, result.bytesRead).toString('utf8')).toBe('hello fd');
  });

  it('supports createWriteStream and createReadStream', async () => {
    mountMemory();

    const writer = fs.createWriteStream('/memory/stream.txt');
    const finished = new Promise<void>((resolve) => writer.on('finish', resolve));
    await writer.write('part1-');
    await writer.end('part2');
    await finished;

    const chunks: string[] = [];
    const ended = new Promise<void>((resolve, reject) => {
      const reader = fs.createReadStream('/memory/stream.txt', { highWaterMark: 4 });
      reader.on('data', (chunk) => chunks.push(chunk.toString('utf8')));
      reader.on('error', reject);
      reader.on('end', resolve);
    });
    await ended;

    expect(chunks).toEqual(['part', '1-pa', 'rt2']);
  });

  it('supports watch, watchFile, and unwatchFile', async () => {
    mountMemory();

    await fs.promises.writeFile('/memory/watched.txt', 'one', 'utf8');
    const watchEvents: Array<[string, string]> = [];
    const fileEvents: Array<[number, number]> = [];
    const watcher = fs.watch('/memory/watched.txt', (eventType, filename) => {
      watchEvents.push([eventType, filename]);
    });
    const fileListener = (curr: unknown, prev: unknown) => {
      fileEvents.push([(curr as { size: number }).size, (prev as { size: number }).size]);
    };
    fs.watchFile('/memory/watched.txt', fileListener);

    await fs.promises.writeFile('/memory/watched.txt', 'three', 'utf8');
    expect(watchEvents).toEqual([['change', 'watched.txt']]);
    expect(fileEvents).toEqual([[5, 3]]);

    watcher.close();
    fs.unwatchFile('/memory/watched.txt', fileListener);
    await fs.promises.writeFile('/memory/watched.txt', 'ignored', 'utf8');
    expect(watchEvents).toHaveLength(1);
    expect(fileEvents).toHaveLength(1);
  });

  it('isolates nested memory mounts and uses longest-prefix routing', async () => {
    registerPlugin('memory', createMemoryStoragePlugin);
    usePlugin('memory', { mountPath: '/memory' });
    usePlugin('memory', { mountPath: '/memory/nested' });

    await fs.promises.writeFile('/memory/same.txt', 'outer', 'utf8');
    await fs.promises.writeFile('/memory/nested/same.txt', 'inner', 'utf8');

    await expect(fs.promises.readFile('/memory/same.txt', 'utf8')).resolves.toBe('outer');
    await expect(fs.promises.readFile('/memory/nested/same.txt', 'utf8')).resolves.toBe('inner');
    await expect(fs.promises.readdir('/memory')).resolves.toEqual(['same.txt']);
    await expect(fs.promises.readdir('/memory/nested')).resolves.toEqual(['same.txt']);
  });

  it('loses data after unregistering and remounting', async () => {
    mountMemory();
    await fs.promises.writeFile('/memory/temp.txt', 'temporary', 'utf8');

    unregisterPlugin('memory');
    usePlugin('memory', { mountPath: '/memory' });

    await expect(fs.promises.readFile('/memory/temp.txt', 'utf8')).rejects.toThrow('ENOENT');
  });

  it('throws on direct duplicate same-path mount', () => {
    mountMemory();

    expect(() => usePlugin('memory', { mountPath: '/memory' })).toThrow(
      'Duplicate plugin mount path: /memory'
    );
  });
});
