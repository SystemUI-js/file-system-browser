import { sortDb, type DirSortConfig, type SortMode, type SortOrder, type IconPosition } from './sort-db';

export interface SortableEntry {
  path: string;
  name: string;
  type: 'file' | 'directory' | 'symlink' | string;
  size?: number;
  createdAt?: number;
  modifiedAt?: number;
}

export interface ApplySortOptions {
  // 如果提供，则覆盖保存的模式
  mode?: SortMode;
  order?: SortOrder;
  // 视图模式：icon 使用 iconPositions，list 使用 manualOrder
  view?: 'icon' | 'list';
}

const DEFAULT_MODE: SortMode = 'name';
const DEFAULT_ORDER: SortOrder = 'asc';

function normDir(dir: string): string {
  if (!dir) return '/';
  let s = dir.trim();
  if (!s.startsWith('/')) s = '/' + s;
  // 去掉末尾多余的斜杠，保留根目录 '/'
  if (s.length > 1 && s.endsWith('/')) s = s.replace(/\/+$/g, '');
  return s;
}

class SortService {
  async getConfig(dir: string): Promise<DirSortConfig> {
    const d = normDir(dir);
    const stored = await sortDb.get(d);
    return (
      stored || {
        dir: d,
        mode: DEFAULT_MODE,
        order: DEFAULT_ORDER,
        manualOrder: [],
        iconPositions: {},
        updatedAt: Date.now(),
      }
    );
  }

  async setConfig(dir: string, patch: Partial<Omit<DirSortConfig, 'dir' | 'updatedAt'>>): Promise<DirSortConfig> {
    const d = normDir(dir);
    const prev = await this.getConfig(d);
    const next: DirSortConfig = {
      ...prev,
      ...patch,
      dir: d,
      updatedAt: Date.now(),
    };
    await sortDb.put(next);
    return next;
  }

  async setManualOrder(dir: string, order: string[]): Promise<DirSortConfig> {
    return this.setConfig(dir, { mode: 'manual', manualOrder: [...order] });
  }

  async setIconPositions(dir: string, positions: Record<string, IconPosition>): Promise<DirSortConfig> {
    return this.setConfig(dir, { iconPositions: { ...positions } });
  }

  async updateIconPosition(dir: string, key: string, pos: IconPosition | null): Promise<DirSortConfig> {
    const cfg = await this.getConfig(dir);
    const next = { ...(cfg.iconPositions || {}) } as Record<string, IconPosition>;
    if (pos) next[key] = pos; else delete next[key];
    return this.setConfig(dir, { iconPositions: next });
  }

  async clear(dir: string): Promise<void> {
    await sortDb.delete(normDir(dir));
  }

  // 在移动/复制后调用，重置源/目标目录的自由排序状态
  async onEntriesMoved(srcDir: string, destDir: string, keys: string[]): Promise<void> {
    const s = normDir(srcDir);
    const d = normDir(destDir);
    if (s === d) return; // 同目录内不处理
    // 从源移除对应键
    const srcCfg = await this.getConfig(s);
    const removed = new Set(keys);
    const srcManual = (srcCfg.manualOrder || []).filter((k) => !removed.has(k));
    const srcIcons = { ...(srcCfg.iconPositions || {}) } as Record<string, IconPosition>;
    for (const k of keys) delete srcIcons[k];
    await this.setConfig(s, { manualOrder: srcManual, iconPositions: srcIcons });

    // 目标目录：将这些键追加到末尾（保持相对顺序），并清除已有位置，交由 UI 决定新位置
    const destCfg = await this.getConfig(d);
    const destSet = new Set(destCfg.manualOrder || []);
    const destManual = [...(destCfg.manualOrder || [])];
    for (const k of keys) {
      if (!destSet.has(k)) destManual.push(k);
    }
    const destIcons = { ...(destCfg.iconPositions || {}) } as Record<string, IconPosition>;
    for (const k of keys) delete destIcons[k];
    await this.setConfig(d, { manualOrder: destManual, iconPositions: destIcons });
  }

  async onEntriesAdded(dir: string, keys: string[]): Promise<void> {
    const d = normDir(dir);
    const cfg = await this.getConfig(d);
    const exists = new Set(cfg.manualOrder || []);
    const manual = [...(cfg.manualOrder || [])];
    for (const k of keys) if (!exists.has(k)) manual.push(k);
    await this.setConfig(d, { manualOrder: manual });
  }

  async onEntriesRemoved(dir: string, keys: string[]): Promise<void> {
    const d = normDir(dir);
    const cfg = await this.getConfig(d);
    const removed = new Set(keys);
    const manual = (cfg.manualOrder || []).filter((k) => !removed.has(k));
    const icons = { ...(cfg.iconPositions || {}) } as Record<string, IconPosition>;
    for (const k of keys) delete icons[k];
    await this.setConfig(d, { manualOrder: manual, iconPositions: icons });
  }

  // 应用排序：不会修改持久化，只根据 cfg/opts 返回排序后的新数组
  async applySort<T extends SortableEntry>(
    dir: string,
    entries: readonly T[],
    opts?: ApplySortOptions
  ): Promise<T[]> {
    const cfg = await this.getConfig(dir);
    const mode = opts?.mode ?? cfg.mode ?? DEFAULT_MODE;
    const order: SortOrder = opts?.order ?? cfg.order ?? DEFAULT_ORDER;
    const view = opts?.view;

    const arr = [...entries];

    // 自由排序（list/icon）优先
    if (mode === 'manual') {
      if (view === 'icon') {
        // 图标模式：保持现有数组顺序，但可以按位置进行稳定排序（可选）。
        const pos = cfg.iconPositions || {};
        const withPos = arr.map((it) => ({
          it,
          p: pos[this.keyOf(it)] || { x: Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER },
        }));
        withPos.sort((a, b) => (a.p.y - b.p.y) || (a.p.x - b.p.x));
        return withPos.map((x) => x.it);
      }
      // 列表模式：按 manualOrder 排
      const orderList = cfg.manualOrder || [];
      const rank = new Map<string, number>();
      orderList.forEach((k, i) => rank.set(k, i));
      return arr.sort((a, b) => (rank.get(this.keyOf(a)) ?? Number.MAX_SAFE_INTEGER) - (rank.get(this.keyOf(b)) ?? Number.MAX_SAFE_INTEGER));
    }

    // 常规排序
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    const factor = order === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      // 目录优先：同类再比较
      const aIsDir = String(a.type) === 'directory';
      const bIsDir = String(b.type) === 'directory';
      if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
      let cmp = 0;
      switch (mode) {
        case 'name':
          cmp = collator.compare(a.name, b.name);
          break;
        case 'createdAt':
          cmp = ((a.createdAt || 0) - (b.createdAt || 0));
          break;
        case 'modifiedAt':
          cmp = ((a.modifiedAt || 0) - (b.modifiedAt || 0));
          break;
        case 'size':
          cmp = ((a.size || 0) - (b.size || 0));
          break;
        default:
          cmp = 0;
      }
      return cmp * factor;
    });
    return arr;
  }

  keyOf(e: SortableEntry): string {
    // 使用 name 作为 key 更易跨文件系统（同一目录内唯一），路径更稳定但移动时会变化。
    return e.name || e.path;
  }
}

export const sorter = new SortService();
export type { DirSortConfig, SortMode, SortOrder, IconPosition };
