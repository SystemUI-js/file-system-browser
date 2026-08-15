import {
  Buffer,
  fs,
  registerPlugin,
  unregisterPlugin,
  usePlugin,
} from '@system-ui-js/file-system-browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIndexedDBStoragePlugin } from './index';

describe('indexeddb storage plugin', () => {
  beforeEach(() => {
    unregisterPlugin('indexeddb-isolation');
  });

  afterEach(() => {
    unregisterPlugin('indexeddb-isolation');
  });

  it('isolates files between separate mount paths', async () => {
    // Given: two IndexedDB instances mounted into the same virtual filesystem.
    registerPlugin('indexeddb-isolation', createIndexedDBStoragePlugin);
    usePlugin('indexeddb-isolation', { mountPath: '/left' });
    usePlugin('indexeddb-isolation', { mountPath: '/right' });

    // When: the same local path is written through both mounts.
    await fs.promises.writeFile(
      '/left/shared.txt',
      Buffer.fromString('left'),
      'utf8'
    );
    await fs.promises.writeFile(
      '/right/shared.txt',
      Buffer.fromString('right'),
      'utf8'
    );

    // Then: each mount retains its own value.
    await expect(
      fs.promises.readFile('/left/shared.txt', 'utf8')
    ).resolves.toBe('left');
    await expect(
      fs.promises.readFile('/right/shared.txt', 'utf8')
    ).resolves.toBe('right');
  });

  it('resolves absolute symlink targets inside a non-root mount', async () => {
    // Given: an IndexedDB plugin mounted below the virtual root.
    registerPlugin('indexeddb-isolation', createIndexedDBStoragePlugin);
    usePlugin('indexeddb-isolation', { mountPath: '/data' });
    await fs.promises.writeFile(
      '/data/target.txt',
      Buffer.fromString('target'),
      'utf8'
    );

    // When: a link uses the public, mount-qualified target path.
    await fs.promises.symlink('/data/target.txt', '/data/link.txt');

    // Then: following the link stays inside this mount's namespace.
    await expect(fs.promises.readFile('/data/link.txt', 'utf8')).resolves.toBe(
      'target'
    );
  });

  it('keeps file descriptors inside the mounted namespace', async () => {
    // Given: a file opened through a non-root IndexedDB mount.
    registerPlugin('indexeddb-isolation', createIndexedDBStoragePlugin);
    usePlugin('indexeddb-isolation', { mountPath: '/data' });
    await fs.promises.writeFile(
      '/data/file.txt',
      Buffer.fromString('before'),
      'utf8'
    );
    const handle = await fs.promises.open('/data/file.txt', 'r+');

    // When: the public descriptor API writes through the returned descriptor.
    await fs.promises.write(handle.fd, Buffer.fromString('after'), 0, 5, 0);
    await fs.promises.close(handle.fd);

    // Then: the mounted file is updated without escaping to the base root.
    await expect(fs.promises.readFile('/data/file.txt', 'utf8')).resolves.toBe(
      'aftere'
    );
  });

  it('routes whole-file descriptor APIs through the mounted namespace', async () => {
    // Given: an open descriptor for a file below a non-root mount.
    registerPlugin('indexeddb-isolation', createIndexedDBStoragePlugin);
    usePlugin('indexeddb-isolation', { mountPath: '/data' });
    await fs.promises.writeFile(
      '/data/file.txt',
      Buffer.fromString('before'),
      'utf8'
    );
    const handle = await fs.promises.open('/data/file.txt', 'r+');

    // When: whole-file read, overwrite, and append APIs receive the descriptor.
    await expect(fs.promises.readFile(handle.fd, 'utf8')).resolves.toBe(
      'before'
    );
    await fs.promises.writeFile(handle.fd, Buffer.fromString('after'));
    await fs.promises.appendFile(handle.fd, Buffer.fromString('-appended'));
    await fs.promises.close(handle.fd);

    // Then: all operations affect the mounted file rather than the base root.
    await expect(fs.promises.readFile('/data/file.txt', 'utf8')).resolves.toBe(
      'after-appended'
    );
  });

  it('writes string chunks through a mounted write stream', async () => {
    // Given: a write stream targeting a non-root IndexedDB mount.
    registerPlugin('indexeddb-isolation', createIndexedDBStoragePlugin);
    usePlugin('indexeddb-isolation', { mountPath: '/data' });
    const stream = fs.createWriteStream('/data/stream.txt');

    // When: a caller ends the stream with text.
    await stream.end('stream-value');

    // Then: the text is encoded and persisted inside the mount.
    await expect(
      fs.promises.readFile('/data/stream.txt', 'utf8')
    ).resolves.toBe('stream-value');
  });
});
