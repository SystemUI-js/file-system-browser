export type SortOrder = 'asc' | 'desc';
export type SortMode = 'name' | 'createdAt' | 'modifiedAt' | 'size' | 'manual';

export interface IconPosition {
  x: number;
  y: number;
}

export interface DirSortConfig {
  dir: string; // normalized absolute dir path
  mode: SortMode;
  order: SortOrder;
  // List 模式下的自由排序（手动顺序），使用子条目的名称或完整路径作为 key
  manualOrder?: string[];
  // 图标模式下的自由摆放位置
  iconPositions?: Record<string, IconPosition>;
  // 额外元数据（预留）
  meta?: Record<string, any>;
  updatedAt: number;
}

const DB_NAME = 'FileSystemSortDB';
const DB_VERSION = 1;
const STORE_NAME = 'sort';

class SortDatabase {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        this.db = req.result;
        resolve();
      };
      req.onupgradeneeded = (ev) => {
        const db = (ev.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'dir' });
        }
      };
    });
  }

  async get(dir: string): Promise<DirSortConfig | undefined> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(dir);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result as any);
    });
  }

  async put(cfg: DirSortConfig): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(cfg);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  async delete(dir: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(dir);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }
}

export const sortDb = new SortDatabase();
