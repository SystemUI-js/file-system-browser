import { beforeAll, afterEach, afterAll, vi } from 'vitest';

// Mock IndexedDB
const mockIDBDatabase = {
  objectStoreNames: { contains: () => false },
  transaction: () => ({
    objectStore: () => ({
      createIndex: () => {},
      index: () => ({
        getAll: () => ({
          onsuccess: null,
          onerror: null,
        }),
        get: () => ({
          onsuccess: null,
          onerror: null,
        }),
        put: () => ({
          onsuccess: null,
          onerror: null,
        }),
        delete: () => ({
          onsuccess: null,
          onerror: null,
        }),
        clear: () => ({
          onsuccess: null,
          onerror: null,
        }),
        getAll: () => ({
          onsuccess: null,
          onerror: null,
        }),
      }),
      put: () => ({
        onsuccess: null,
        onerror: null,
      }),
      get: () => ({
        onsuccess: null,
        onerror: null,
      }),
      delete: () => ({
        onsuccess: null,
        onerror: null,
      }),
      getAll: () => ({
        onsuccess: null,
        onerror: null,
      }),
      clear: () => ({
        onsuccess: null,
        onerror: null,
      }),
    }),
  }),
  close: () => {},
};

const createMockIDBOpenDBRequest = (result: unknown) => ({
  onsuccess: null as ((this: IDBOpenDBRequest, ev: Event) => unknown) | null,
  onerror: null as ((this: IDBOpenDBRequest, ev: Event) => unknown) | null,
  onupgradeneeded: null as ((this: IDBOpenDBRequest, ev: IDBVersionChangeEvent) => unknown) | null,
  result,
});

global.indexedDB = {
  open: vi.fn().mockImplementation(() => {
    return createMockIDBOpenDBRequest(mockIDBDatabase);
  }),
} as unknown as IDBFactory;

// Mock navigator.storage
Object.defineProperty(global.navigator, 'storage', {
  value: {
    persisted: vi.fn().mockResolvedValue(false),
    persist: vi.fn().mockResolvedValue(true),
    estimate: vi.fn().mockResolvedValue({
      quota: 1000000000,
      usage: 500000000,
    }),
  },
  writable: true,
});

// Mock console.warn to avoid noise in tests
global.console = {
  ...console,
  warn: vi.fn(),
  error: vi.fn(),
};
