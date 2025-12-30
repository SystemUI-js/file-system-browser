import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sortDb } from './sort-db';

// Mock IndexedDB
const indexedDB = {
  open: vi.fn(),
};

(global as any).indexedDB = indexedDB;

describe('SortDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('init', () => {
    it('should call indexedDB.open', async () => {
      const mockDB = {
        name: 'FileSystemSortDB',
        version: 1,
        objectStoreNames: { contains: () => false },
        createObjectStore: vi.fn(),
        transaction: () => ({
          objectStore: () => ({
            createIndex: vi.fn(),
            indexNames: { contains: () => false },
          }),
        }),
        onabort: null,
        onclose: null,
        onerror: null,
        onversionchange: null,
      } as unknown as IDBDatabase;

      const request = {
        onsuccess: null as
          | ((this: IDBOpenDBRequest, ev: Event) => unknown)
          | null,
        onerror: null as
          | ((this: IDBOpenDBRequest, ev: Event) => unknown)
          | null,
        onblocked: null,
        onupgradeneeded: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as unknown as IDBOpenDBRequest;

      indexedDB.open.mockReturnValue(request);

      const initPromise = sortDb.init();

      // Simulate success
      if (request.onsuccess) {
        Object.defineProperty(request, 'result', { value: mockDB });
        request.onsuccess.call(request, new Event('success'));
      }

      await initPromise;

      expect(indexedDB.open).toHaveBeenCalledWith('FileSystemSortDB', 1);
    });
  });

  describe('database operations', () => {
    it('should have initialized database property', () => {
      expect(sortDb).toHaveProperty('init');
      expect(sortDb).toHaveProperty('get');
      expect(sortDb).toHaveProperty('put');
      expect(sortDb).toHaveProperty('delete');
    });
  });

  describe('Type definitions', () => {
    it('should have correct SortOrder type', () => {
      const order: import('./sort-db').SortOrder = 'asc';
      expect(order).toBe('asc');

      const order2: import('./sort-db').SortOrder = 'desc';
      expect(order2).toBe('desc');
    });

    it('should have correct SortMode type', () => {
      const mode: import('./sort-db').SortMode = 'name';
      expect(mode).toBe('name');

      const mode2: import('./sort-db').SortMode = 'createdAt';
      expect(mode2).toBe('createdAt');

      const mode3: import('./sort-db').SortMode = 'modifiedAt';
      expect(mode3).toBe('modifiedAt');

      const mode4: import('./sort-db').SortMode = 'size';
      expect(mode4).toBe('size');

      const mode5: import('./sort-db').SortMode = 'manual';
      expect(mode5).toBe('manual');
    });

    it('should have correct IconPosition interface', () => {
      const position: import('./sort-db').IconPosition = {
        x: 100,
        y: 200,
      };
      expect(position.x).toBe(100);
      expect(position.y).toBe(200);
    });

    it('should have correct DirSortConfig interface', () => {
      const config: import('./sort-db').DirSortConfig = {
        dir: '/test',
        mode: 'name',
        order: 'asc',
        updatedAt: Date.now(),
        manualOrder: ['file1', 'file2'],
        iconPositions: {
          file1: { x: 0, y: 0 },
        },
        meta: { custom: 'value' },
      };
      expect(config.dir).toBe('/test');
      expect(config.mode).toBe('name');
      expect(config.order).toBe('asc');
      expect(Array.isArray(config.manualOrder)).toBe(true);
      expect(typeof config.iconPositions).toBe('object');
      expect(typeof config.meta).toBe('object');
    });
  });
});
