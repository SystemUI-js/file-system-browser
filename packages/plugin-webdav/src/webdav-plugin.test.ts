import { Buffer as BufferPolyfill } from '@system-ui-js/file-system-browser';
import { vi } from 'vitest';
import { createClient } from 'webdav/web';
import { createWebDAVStoragePlugin } from './index';

vi.mock('webdav/web', () => ({
  createClient: vi.fn(),
}));

const mockCreateClient = vi.mocked(createClient);

type MockClient = {
  getFileContents: ReturnType<typeof vi.fn>;
  putFileContents: ReturnType<typeof vi.fn>;
  createDirectory: ReturnType<typeof vi.fn>;
  getDirectoryContents: ReturnType<typeof vi.fn>;
  deleteFile: ReturnType<typeof vi.fn>;
  moveFile: ReturnType<typeof vi.fn>;
  copyFile: ReturnType<typeof vi.fn>;
  stat: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
};

type TestHandlers = Record<string, (...args: unknown[]) => unknown>;

function makeClient(): MockClient {
  return {
    getFileContents: vi.fn(),
    putFileContents: vi.fn(),
    createDirectory: vi.fn(),
    getDirectoryContents: vi.fn(),
    deleteFile: vi.fn(),
    moveFile: vi.fn(),
    copyFile: vi.fn(),
    stat: vi.fn(),
    exists: vi.fn(),
  };
}

function makeContext() {
  return {
    baseFs: {} as never,
    Buffer: BufferPolyfill,
    createFd: vi.fn(),
    releaseFd: vi.fn(),
    baseWatch: vi.fn() as never,
    baseWatchFile: vi.fn() as never,
    baseUnwatchFile: vi.fn() as never,
    baseCreateReadStream: vi.fn() as never,
    baseCreateWriteStream: vi.fn() as never,
  };
}

function makePlugin(client = makeClient()) {
  mockCreateClient.mockReturnValue(client);
  const plugin = createWebDAVStoragePlugin(
    {
      baseUrl: 'https://dav.example.com',
      mountPath: '/cloud',
      remoteRoot: '/remote/root',
      token: 'token-123',
      headers: { 'X-Test': 'yes' },
    },
    makeContext()
  );
  if (!plugin.handlers) throw new Error('Expected WebDAV handlers');
  return { client, handlers: plugin.handlers as unknown as TestHandlers };
}

describe('WebDAV storage plugin', () => {
  beforeEach(() => {
    mockCreateClient.mockReset();
  });

  it('creates one authenticated WebDAV client', () => {
    makePlugin();

    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockCreateClient).toHaveBeenCalledWith('https://dav.example.com', {
      headers: { 'X-Test': 'yes', Authorization: 'Bearer token-123' },
      fetch: undefined,
      withCredentials: undefined,
    });
  });

  it('uses auto auth for username/password so Digest challenges can be handled', () => {
    const client = makeClient();
    mockCreateClient.mockReturnValue(client);

    createWebDAVStoragePlugin(
      {
        baseUrl: 'https://dav.example.com',
        username: 'alice',
        password: ' secret ',
        headers: { 'X-Test': 'yes' },
      },
      makeContext()
    );

    expect(mockCreateClient).toHaveBeenCalledWith('https://dav.example.com', {
      authType: 'auto',
      username: 'alice',
      password: ' secret ',
      headers: { 'X-Test': 'yes' },
      fetch: undefined,
      withCredentials: undefined,
    });
  });

  it('allows explicit WebDAV auth type overrides', () => {
    const client = makeClient();
    mockCreateClient.mockReturnValue(client);

    createWebDAVStoragePlugin(
      {
        baseUrl: 'https://dav.example.com',
        authType: 'digest',
        username: 'alice',
        password: 'secret',
        withCredentials: true,
      },
      makeContext()
    );

    expect(mockCreateClient).toHaveBeenCalledWith('https://dav.example.com', {
      authType: 'digest',
      username: 'alice',
      password: 'secret',
      headers: {},
      fetch: undefined,
      withCredentials: true,
    });
  });

  it('reads and writes plugin-local paths under remoteRoot', async () => {
    const { client, handlers } = makePlugin();
    client.getFileContents.mockResolvedValue(
      BufferPolyfill.fromString('hello')
    );

    await expect(handlers.readFile('/docs/a.txt', 'utf8')).resolves.toBe(
      'hello'
    );
    await handlers.writeFile('/docs/a.txt', 'updated', 'utf8');

    expect(client.getFileContents).toHaveBeenCalledWith(
      '/remote/root/docs/a.txt',
      {
        format: 'binary',
      }
    );
    expect(client.putFileContents).toHaveBeenCalledWith(
      '/remote/root/docs/a.txt',
      BufferPolyfill.fromString('updated')
    );
  });

  it('appends by reading existing contents and writing merged data', async () => {
    const { client, handlers } = makePlugin();
    client.exists.mockResolvedValue(true);
    client.getFileContents.mockResolvedValue(BufferPolyfill.fromString('old-'));

    await handlers.appendFile('/notes.txt', 'new', 'utf8');

    const written = client.putFileContents.mock.calls[0][1] as BufferPolyfill;
    expect(client.exists).toHaveBeenCalledWith('/remote/root/notes.txt');
    expect(written.toString()).toBe('old-new');
  });

  it('returns names or Dirent objects from readdir', async () => {
    const { client, handlers } = makePlugin();
    client.getDirectoryContents.mockResolvedValue([
      {
        basename: 'file.txt',
        type: 'file',
        size: 4,
        lastmod: '2024-01-01T00:00:00Z',
      },
      {
        basename: 'folder',
        type: 'directory',
        size: 0,
        lastmod: '2024-01-01T00:00:00Z',
      },
    ]);

    await expect(handlers.readdir('/')).resolves.toEqual([
      'file.txt',
      'folder',
    ]);
    const dirents = (await handlers.readdir('/', {
      withFileTypes: true,
    })) as Array<
      string | { name: string; isFile(): boolean; isDirectory(): boolean }
    >;

    expect(dirents[0]).toMatchObject({ name: 'file.txt' });
    expect(typeof dirents[0] === 'string' ? false : dirents[0].isFile()).toBe(
      true
    );
    expect(
      typeof dirents[1] === 'string' ? false : dirents[1].isDirectory()
    ).toBe(true);
  });

  it('converts FileStat to Stats-compatible objects', async () => {
    const { client, handlers } = makePlugin();
    client.stat.mockResolvedValue({
      basename: 'folder',
      type: 'directory',
      size: '12',
      lastmod: '2024-02-03T04:05:06Z',
    });

    const stats = (await handlers.stat('/folder')) as {
      size: number;
      mtimeMs: number;
      isDirectory(): boolean;
      isFile(): boolean;
      isSymbolicLink(): boolean;
    };

    expect(stats.size).toBe(12);
    expect(stats.mtimeMs).toBe(Date.parse('2024-02-03T04:05:06Z'));
    expect(stats.isDirectory()).toBe(true);
    expect(stats.isFile()).toBe(false);
    expect(stats.isSymbolicLink()).toBe(false);
  });

  it('maps mutation and existence handlers to WebDAV methods', async () => {
    const { client, handlers } = makePlugin();
    client.exists.mockResolvedValue(true);

    await handlers.mkdir('/dir');
    await handlers.rm('/old');
    await handlers.unlink('/file');
    await handlers.rmdir('/empty');
    await handlers.rename('/from', '/to');
    await handlers.copyFile('/src', '/dest');
    await expect(handlers.exists('/src')).resolves.toBe(true);
    await expect(handlers.access('/src')).resolves.toBeUndefined();

    expect(client.createDirectory).toHaveBeenCalledWith('/remote/root/dir');
    expect(client.deleteFile).toHaveBeenCalledWith('/remote/root/old');
    expect(client.deleteFile).toHaveBeenCalledWith('/remote/root/file');
    expect(client.deleteFile).toHaveBeenCalledWith('/remote/root/empty');
    expect(client.moveFile).toHaveBeenCalledWith(
      '/remote/root/from',
      '/remote/root/to'
    );
    expect(client.copyFile).toHaveBeenCalledWith(
      '/remote/root/src',
      '/remote/root/dest'
    );
  });

  it('forwards recursive directory creation to WebDAV', async () => {
    // Given: a WebDAV-backed mount.
    const { client, handlers } = makePlugin();

    // When: callers request recursive directory creation.
    await handlers.mkdir('/parent/child', { recursive: true });

    // Then: the WebDAV client receives the recursive option.
    expect(client.createDirectory).toHaveBeenCalledWith(
      '/remote/root/parent/child',
      { recursive: true }
    );
  });

  it('ignores missing paths when rm uses force', async () => {
    // Given: the WebDAV server reports that the path is missing.
    const { client, handlers } = makePlugin();
    client.deleteFile.mockRejectedValue(
      Object.assign(new Error('Invalid response: 404 Not Found'), {
        status: 404,
      })
    );

    // When/Then: force makes removal idempotent.
    await expect(
      handlers.rm('/missing.txt', { force: true })
    ).resolves.toBeUndefined();
  });

  it('does not hide structured non-404 errors when rm uses force', async () => {
    // Given: an upstream failure whose message happens to mention 404.
    const { client, handlers } = makePlugin();
    client.deleteFile.mockRejectedValue(
      Object.assign(new Error('503 response included prior 404 details'), {
        status: 503,
      })
    );

    // When/Then: force still surfaces failures other than a missing target.
    await expect(handlers.rm('/file.txt', { force: true })).rejects.toThrow(
      "WebDAV rm request failed for '/remote/root/file.txt'"
    );
  });

  it('throws exact deterministic ENOTSUP errors for unsupported operations', async () => {
    const { handlers } = makePlugin();
    const unsupportedCases: Array<[string, unknown[], string]> = [
      ['symlink', ['/a', '/b'], 'ENOTSUP: WebDAV does not support symlink'],
      ['readlink', ['/a'], 'ENOTSUP: WebDAV does not support readlink'],
      ['link', ['/a', '/b'], 'ENOTSUP: WebDAV does not support link'],
      ['nlink', ['/a'], 'ENOTSUP: WebDAV does not support nlink'],
      ['watch', ['/a', vi.fn()], 'ENOTSUP: WebDAV does not support watch'],
      [
        'watchFile',
        ['/a', vi.fn()],
        'ENOTSUP: WebDAV does not support watchFile',
      ],
      ['unwatchFile', ['/a'], 'ENOTSUP: WebDAV does not support unwatchFile'],
      [
        'createReadStream',
        ['/a'],
        'ENOTSUP: WebDAV does not support createReadStream',
      ],
      [
        'createWriteStream',
        ['/a'],
        'ENOTSUP: WebDAV does not support createWriteStream',
      ],
      ['open', ['/a', 'r'], 'ENOTSUP: WebDAV does not support open'],
      [
        'read',
        [1, new Uint8Array(1), 0, 1, 0],
        'ENOTSUP: WebDAV does not support read',
      ],
      [
        'write',
        [1, new Uint8Array(1), 0, 1, 0],
        'ENOTSUP: WebDAV does not support write',
      ],
      ['close', [1], 'ENOTSUP: WebDAV does not support close'],
    ];

    for (const [name, args, message] of unsupportedCases) {
      await expect(
        Promise.resolve(handlers[name](...args))
      ).rejects.toMatchObject({
        message,
      });
    }
  });

  it('wraps network and auth failures with user-readable WebDAV errors', async () => {
    const { client, handlers } = makePlugin();
    client.exists.mockRejectedValue(new Error('Failed to fetch'));

    await expect(handlers.exists('/offline')).rejects.toThrow(
      "WebDAV exists CORS or network failure for '/remote/root/offline': Failed to fetch"
    );
  });
});
