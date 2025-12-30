export interface FileEntry {
  path: string;
  name: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  content?: ArrayBuffer;
  mimeType?: string;
  // symlink target (when type === 'symlink')
  linkTarget?: string;
  // hard link group key (all hard-linked files share the same key)
  hardLinkKey?: string;
  createdAt: number;
  modifiedAt: number;
  parentPath: string;
}

const DB_NAME = 'FileSystemDB';
const DB_VERSION = 2;
const STORE_NAME = 'files';

class Database {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'path' });
          store.createIndex('parentPath', 'parentPath', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('hardLinkKey', 'hardLinkKey', { unique: false });
        } else {
          // upgrade indexes if needed
          const request = event.target as IDBOpenDBRequest;
          const txn = request.transaction as IDBTransaction;
          const store = txn.objectStore
            ? txn.objectStore(STORE_NAME)
            : db
                .transaction(STORE_NAME, 'versionchange')
                .objectStore(STORE_NAME);
          const indexNames = store.indexNames;
          if (!indexNames.contains || !indexNames.contains('parentPath')) {
            try {
              store.createIndex('parentPath', 'parentPath', { unique: false });
            } catch (e) {
              void 0;
            }
          }
          if (!indexNames.contains || !indexNames.contains('type')) {
            try {
              store.createIndex('type', 'type', { unique: false });
            } catch (e) {
              void 0;
            }
          }
          if (!indexNames.contains || !indexNames.contains('hardLinkKey')) {
            try {
              store.createIndex('hardLinkKey', 'hardLinkKey', {
                unique: false,
              });
            } catch (e) {
              void 0;
            }
          }
        }
      };
    });
  }

  async put(entry: FileEntry): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(entry);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async get(path: string): Promise<FileEntry | undefined> {
    if (!this.db) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(path);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async delete(path: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(path);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getByParentPath(parentPath: string): Promise<FileEntry[]> {
    if (!this.db) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('parentPath');
      const request = index.getAll(parentPath);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getAll(): Promise<FileEntry[]> {
    if (!this.db) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getByHardLinkKey(key: string): Promise<FileEntry[]> {
    if (!this.db) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      let index: IDBIndex;
      try {
        index = store.index('hardLinkKey');
      } catch (e) {
        // index might not exist if DB not upgraded properly; fallback to scan all
        const reqAll = store.getAll();
        reqAll.onerror = () => reject(reqAll.error);
        reqAll.onsuccess = () => {
          const all = reqAll.result as FileEntry[];
          resolve(all.filter((e) => e.hardLinkKey === key));
        };
        return;
      }
      const request = index.getAll(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async clear(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

export const db = new Database();
