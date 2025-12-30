import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from './db';

// Mock IndexedDB
const indexedDB = {
  open: vi.fn(),
};

(global as any).indexedDB = indexedDB;

describe('Database', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('init', () => {
    it('should call indexedDB.open', async () => {
      const mockDB = {
        name: 'FileSystemDB',
        version: 2,
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
        onsuccess: null as ((this: IDBOpenDBRequest, ev: Event) => unknown) | null,
        onerror: null as ((this: IDBOpenDBRequest, ev: Event) => unknown) | null,
        onblocked: null,
        onupgradeneeded: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as unknown as IDBOpenDBRequest;

      indexedDB.open.mockReturnValue(request);

      const initPromise = db.init();
      
      // Simulate success
      if (request.onsuccess) {
        Object.defineProperty(request, 'result', { value: mockDB });
        request.onsuccess.call(request, new Event('success'));
      }

      await initPromise;

      expect(indexedDB.open).toHaveBeenCalledWith('FileSystemDB', 2);
    });

  });

  describe('database operations', () => {
    it('should have initialized database methods', () => {
      expect(db).toHaveProperty('init');
      expect(db).toHaveProperty('get');
      expect(db).toHaveProperty('put');
      expect(db).toHaveProperty('delete');
      expect(db).toHaveProperty('getByParentPath');
      expect(db).toHaveProperty('getAll');
      expect(db).toHaveProperty('getByHardLinkKey');
      expect(db).toHaveProperty('clear');
    });
  });
});
