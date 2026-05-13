import fs, {
  Dirent,
  SortMode,
  SortOrder,
  registerPlugin,
  usePlugin,
  unregisterPlugin,
} from '@system-ui-js/file-system-browser';
import { sorter } from '@system-ui-js/file-system-browser';
import { createMemoryStoragePlugin } from '@system-ui-js/file-system-plugin-memory';
import { createIndexedDBStoragePlugin } from '@system-ui-js/file-system-plugin-indexeddb';
import { createWebDAVStoragePlugin } from '@system-ui-js/file-system-plugin-webdav';

declare global {
  interface Window {
    handleFileClick: (
      path: string,
      type: 'file' | 'directory' | 'symlink'
    ) => Promise<void>;
    moveUp: (name: string) => Promise<void>;
    moveDown: (name: string) => Promise<void>;
    downloadFile: (path: string) => Promise<void>;
    showDetails: (path: string) => Promise<void>;
    copyFile: (path: string) => void;
    cutFile: (path: string) => void;
    deleteFile: (path: string) => Promise<void>;
  }
}

type UIItem = {
  path: string;
  name: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  modifiedAt: number;
  linkTarget?: string;
  nlink?: number;
};

type WebDAVDemoConfig = {
  baseUrl: string;
  username?: string;
  password?: string;
  token?: string;
  remoteRoot?: string;
};

type WebDAVDemoConfigStore = {
  load(): WebDAVDemoConfig | null;
  save(config: WebDAVDemoConfig): void;
  clear(): void;
};

let memoryWebDAVConfig: WebDAVDemoConfig | null = null;
const memoryWebDAVConfigStore: WebDAVDemoConfigStore = {
  load() {
    return memoryWebDAVConfig;
  },
  save(config) {
    memoryWebDAVConfig = config;
  },
  clear() {
    memoryWebDAVConfig = null;
  },
};

let webDAVConfigStore: WebDAVDemoConfigStore = memoryWebDAVConfigStore;

(window as any).setWebDAVConfigStore = (store: WebDAVDemoConfigStore) => {
  webDAVConfigStore = store;
};
(window as any).saveWebDAVConfig = (config: WebDAVDemoConfig) => {
  webDAVConfigStore.save(config);
};
(window as any).loadWebDAVConfig = () => {
  return webDAVConfigStore.load();
};
(window as any).clearWebDAVConfig = () => {
  webDAVConfigStore.clear();
};

let currentPath = '/';
let clipboard: { type: 'copy' | 'cut'; path: string } | null = null;
const mountedPaths = new Map<string, string>();

// DOM elements
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const uploadBtn = document.getElementById('uploadBtn') as HTMLButtonElement;
const createFolderBtn = document.getElementById(
  'createFolderBtn'
) as HTMLButtonElement;
const clearAllBtn = document.getElementById('clearAllBtn') as HTMLButtonElement;
const createSymlinkBtn = document.getElementById(
  'createSymlinkBtn'
) as HTMLButtonElement;
const createHardlinkBtn = document.getElementById(
  'createHardlinkBtn'
) as HTMLButtonElement;
const fileList = document.getElementById('fileList') as HTMLDivElement;
const currentPathSpan = document.getElementById(
  'currentPath'
) as HTMLSpanElement;
const clipboardInfo = document.getElementById(
  'clipboardInfo'
) as HTMLDivElement;
const pasteBtn = document.getElementById('pasteBtn') as HTMLButtonElement;
const modal = document.getElementById('modal') as HTMLDivElement;
const modalTitle = document.getElementById('modalTitle') as HTMLHeadingElement;
const modalBody = document.getElementById('modalBody') as HTMLDivElement;
const closeModal = document.querySelector('.close') as HTMLSpanElement;
// storage info elements
const persistStatusEl = document.getElementById(
  'persistStatus'
) as HTMLSpanElement | null;
const usedSpaceEl = document.getElementById(
  'usedSpace'
) as HTMLSpanElement | null;
const totalSpaceEl = document.getElementById(
  'totalSpace'
) as HTMLSpanElement | null;
const requestPersistBtn = document.getElementById(
  'requestPersistBtn'
) as HTMLButtonElement | null;
// search elements
const searchInput = document.getElementById(
  'searchInput'
) as HTMLInputElement | null;
const searchBtn = document.getElementById(
  'searchBtn'
) as HTMLButtonElement | null;
const clearSearchBtn = document.getElementById(
  'clearSearchBtn'
) as HTMLButtonElement | null;
const searchFromRoot = document.getElementById(
  'searchFromRoot'
) as HTMLInputElement | null;
const searchStatus = document.getElementById(
  'searchStatus'
) as HTMLSpanElement | null;
// sort controls
const sortModeSel = document.getElementById(
  'sortMode'
) as HTMLSelectElement | null;
const sortOrderSel = document.getElementById(
  'sortOrder'
) as HTMLSelectElement | null;
const webdavUrlInput = document.getElementById(
  'webdavUrl'
) as HTMLInputElement | null;
const webdavUsernameInput = document.getElementById(
  'webdavUsername'
) as HTMLInputElement | null;
const webdavPasswordInput = document.getElementById(
  'webdavPassword'
) as HTMLInputElement | null;
const webdavTokenInput = document.getElementById(
  'webdavToken'
) as HTMLInputElement | null;
const webdavRemoteRootInput = document.getElementById(
  'webdavRemoteRoot'
) as HTMLInputElement | null;
const webdavConnectBtn = document.getElementById(
  'webdavConnectBtn'
) as HTMLButtonElement | null;
const webdavDisconnectBtn = document.getElementById(
  'webdavDisconnectBtn'
) as HTMLButtonElement | null;
const webdavStatus = document.getElementById(
  'webdavStatus'
) as HTMLSpanElement | null;
const mountPluginSelect = document.getElementById(
  'mountPluginSelect'
) as HTMLSelectElement | null;
const mountPathInput = document.getElementById(
  'mountPathInput'
) as HTMLInputElement | null;
const mountBtn = document.getElementById(
  'mountBtn'
) as HTMLButtonElement | null;
const mountStatus = document.getElementById(
  'mountStatus'
) as HTMLSpanElement | null;
const webdavMountFields = document.getElementById(
  'webdavMountFields'
) as HTMLDivElement | null;

let searchSeq = 0; // 防止竞态：仅展示最后一次搜索结果
let lastRenderedFiles: UIItem[] = [];
let currentSortMode: 'name' | 'createdAt' | 'modifiedAt' | 'size' | 'manual' =
  'name';
let currentSortOrder: 'asc' | 'desc' = 'asc';

async function init() {
  try {
    if (
      !registerPlugin ||
      !usePlugin ||
      !unregisterPlugin ||
      !createIndexedDBStoragePlugin ||
      !createMemoryStoragePlugin ||
      !createWebDAVStoragePlugin
    ) {
      throw new Error('Plugin APIs not available');
    }
    try {
      registerPlugin('memory', createMemoryStoragePlugin);
    } catch {
      // ignore duplicate registration
    }
    try {
      registerPlugin('indexeddb', createIndexedDBStoragePlugin);
    } catch {
      // ignore duplicate registration
    }
    try {
      registerPlugin('webdav', createWebDAVStoragePlugin);
    } catch {
      // ignore duplicate registration
    }
    await refreshFileList();
    await refreshStorageInfo();
  } catch (error) {
    console.error('Failed to initialize:', error);
    alert('初始化文件系统失败');
  }
}

function resolveWritePath(name: string): string {
  if (currentPath === '/') {
    return `/${name}`;
  }
  return `${currentPath}/${name}`;
}

uploadBtn.addEventListener('click', async () => {
  const files = fileInput.files;
  if (!files || files.length === 0) {
    alert('请选择文件');
    return;
  }

  try {
    // 确认持久化（仅第一次尝试时弹窗）
    await ensurePersistenceBeforeUpload();

    // 获取当前目录已存在的名称集合，用于同名校验
    const existedNames = new Set<string>();
    try {
      const dirents = (await fs.promises.readdir(currentPath, {
        withFileTypes: true,
      })) as Dirent[];
      for (const d of dirents) {
        existedNames.add(d.name || '');
      }
    } catch {
      // ignore, 若读取失败，按无文件处理
    }

    let successCount = 0;
    const skipDuplicates: string[] = [];
    const failed: { name: string; reason: string }[] = [];

    for (const file of Array.from(files)) {
      if (existedNames.has(file.name)) {
        skipDuplicates.push(file.name);
        continue;
      }
      try {
        const path = resolveWritePath(file.name);
        const buf = new Uint8Array(await file.arrayBuffer());
        await fs.promises.writeFile(path, buf);
        successCount++;
        existedNames.add(file.name);
      } catch (e) {
        failed.push({ name: file.name, reason: (e as Error).message });
      }
    }

    fileInput.value = '';
    await refreshFileList();
    await refreshStorageInfo();

    // 组合提示信息
    const parts: string[] = [];
    if (successCount > 0) parts.push(`成功上传 ${successCount} 个文件`);
    if (skipDuplicates.length > 0)
      parts.push(
        `已阻止同名文件 ${skipDuplicates.length} 个（${skipDuplicates.slice(0, 5).join(', ')}${skipDuplicates.length > 5 ? ' 等' : ''}）`
      );
    if (failed.length > 0) parts.push(`上传失败 ${failed.length} 个`);
    if (parts.length === 0) {
      alert('未上传任何文件（可能均为同名或失败）');
    } else {
      alert(parts.join('；'));
    }
  } catch (error) {
    console.error('Upload failed:', error);
    alert(`上传失败: ${(error as Error).message}`);
  }
});

// Create folder
createFolderBtn.addEventListener('click', async () => {
  const folderName = prompt('请输入文件夹名称:');
  if (!folderName) return;

  try {
    const path = resolveWritePath(folderName);
    await fs.promises.mkdir(path, { recursive: true });
    await refreshFileList();
    try {
      await sorter.onEntriesAdded(currentPath, [folderName]);
    } catch (e) {
      void 0;
    }
    alert('文件夹创建成功');
  } catch (error) {
    console.error('Create folder failed:', error);
    alert(`创建文件夹失败: ${(error as Error).message}`);
  }
});

// Create symlink
createSymlinkBtn?.addEventListener('click', async () => {
  const target = prompt('请输入软链接的目标路径（可以是文件或目录）：');
  if (!target) return;
  const name = prompt('请输入软链接名称：');
  if (!name) return;
  const linkPath = resolveWritePath(name);
  try {
    await fs.promises.symlink(target, linkPath);
    await refreshFileList();
    try {
      await sorter.onEntriesAdded(currentPath, [name]);
    } catch (e) {
      void 0;
    }
    alert('软链接创建成功');
  } catch (error) {
    console.error('Create symlink failed:', error);
    alert(`创建软链接失败: ${(error as Error).message}`);
  }
});

// Create a hard link (only file supported)
createHardlinkBtn?.addEventListener('click', async () => {
  const src = prompt('请输入要创建硬链接的源文件路径（仅支持文件）：');
  if (!src) return;
  const name = prompt('请输入硬链接名称：');
  if (!name) return;
  const dest = resolveWritePath(name);
  try {
    await fs.promises.link(src, dest);
    await refreshFileList();
    try {
      await sorter.onEntriesAdded(currentPath, [name]);
    } catch (e) {
      void 0;
    }
    alert('硬链接创建成功');
  } catch (error) {
    console.error('Create hardlink failed:', error);
    alert(`创建硬链接失败: ${(error as Error).message}`);
  }
});

// Clear all files
clearAllBtn.addEventListener('click', async () => {
  if (!confirm('确定要清空当前目录下所有文件吗？此操作不可撤销！')) return;

  try {
    if (currentPath === '/') {
      alert('根目录下没有文件可清空');
      return;
    }
    const dirents = await fs.promises.readdir(currentPath, {
      withFileTypes: true,
    });
    for (const d of Array.isArray(dirents) ? dirents : []) {
      const name = typeof d === 'string' ? d : d.name;
      if (name) {
        await fs.promises.rm(
          currentPath === '/' ? `/${name}` : `${currentPath}/${name}`,
          {
            recursive: true,
            force: true,
          }
        );
      }
    }
    clipboard = null;
    updateClipboardUI();
    await refreshFileList();
    try {
      await sorter.clear(currentPath);
    } catch (e) {
      void 0;
    }
    alert('所有文件已清空');
  } catch (error) {
    console.error('Clear failed:', error);
    alert(`清空失败: ${(error as Error).message}`);
  }
});

// Paste
pasteBtn.addEventListener('click', async () => {
  if (!clipboard) return;

  try {
    const fileName = clipboard.path.split('/').pop() || '';
    const destPath = resolveWritePath(fileName);

    if (clipboard.type === 'copy') {
      await copyPath(clipboard.path, destPath);
      alert('复制成功');
      try {
        await sorter.onEntriesAdded(currentPath, [fileName]);
      } catch (e) {
        void 0;
      }
    } else {
      await fs.promises.rename(clipboard.path, destPath);
      alert('移动成功');
      try {
        const srcDir = parentOf(clipboard.path);
        await sorter.onEntriesMoved(srcDir, currentPath, [fileName]);
      } catch (e) {
        void 0;
      }
      clipboard = null;
      updateClipboardUI();
    }

    await refreshFileList();
  } catch (error) {
    console.error('Paste failed:', error);
    alert(`操作失败: ${(error as Error).message}`);
  }
});

// Refresh file list
async function refreshFileList() {
  try {
    const list = await listUIItems(currentPath);
    currentPathSpan.textContent = currentPath;
    uploadBtn.textContent =
      currentPath === '/' ? '上传到当前目录' : '上传到根目录';
    // 同步排序配置到控件
    try {
      const cfg = await sorter.getConfig(currentPath);
      currentSortMode = cfg.mode;
      currentSortOrder = cfg.order;
      if (sortModeSel) sortModeSel.value = cfg.mode;
      if (sortOrderSel) sortOrderSel.value = cfg.order;
      renderFileList(list, cfg.mode === 'manual');
    } catch {
      renderFileList(list, false);
    }
    // 同步刷新存储信息
    await refreshStorageInfo();
  } catch (error) {
    console.error('Refresh failed:', error);
    if (
      error instanceof Error &&
      error.message === 'No storage plugin mounted for this path'
    ) {
      if (currentPath !== '/') {
        currentPath = '/';
        currentPathSpan.textContent = currentPath;
      }
      try {
        const list = await listUIItems('/');
        renderFileList(list, false);
      } catch {
        fileList.innerHTML = '';
      }
    } else {
      fileList.innerHTML = '<div class="empty-state">❌ 加载失败</div>';
    }
  }
}

// Search integration
async function performSearch(term: string, base: string): Promise<void> {
  const mySeq = ++searchSeq;
  if (searchStatus) searchStatus.textContent = '搜索中…';
  // 显示占位
  fileList.innerHTML = '<div class="empty-state">🔎 正在搜索…</div>';

  term = term.trim();
  if (!term) {
    // 空查询恢复列表
    if (searchStatus) searchStatus.textContent = '';
    await refreshFileList();
    return;
  }

  try {
    const results = await searchRecursive(base, term, 500);
    // 若有新搜索发起，丢弃当前结果
    if (mySeq !== searchSeq) return;
    currentPathSpan.textContent = base;
    renderFileList(results);
    if (searchStatus) searchStatus.textContent = `找到 ${results.length} 项`;
  } catch (e) {
    if (mySeq !== searchSeq) return;
    console.error('Search failed:', e);
    fileList.innerHTML = '<div class="empty-state">❌ 搜索失败</div>';
    if (searchStatus) searchStatus.textContent = '搜索失败';
  } finally {
    // no-op
  }
}

// 递归搜索（BFS），按名称包含匹配；避免跟随符号链接以防循环
async function searchRecursive(
  base: string,
  term: string,
  maxResults = 500
): Promise<UIItem[]> {
  const queue: string[] = [base];
  const results: UIItem[] = [];
  const visited = new Set<string>();
  const lower = term.toLowerCase();

  while (queue.length > 0) {
    const dir = queue.shift()!;
    if (visited.has(dir)) continue;
    visited.add(dir);
    let dirents: string[] | Dirent[] = [];
    try {
      dirents = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const d of dirents) {
      const name = d.name;
      const full = dir === '/' ? `/${name}` : `${dir}/${name}`;

      try {
        const isSymlink =
          typeof d.isSymbolicLink === 'function' && d.isSymbolicLink();
        // 不跟随符号链接深入，避免环
        const statTarget = isSymlink
          ? await fs.promises.lstat(full)
          : await fs.promises.stat(full);
        const isDir = statTarget.isDirectory && statTarget.isDirectory();

        // 名称匹配则加入结果
        if (name.toLowerCase().includes(lower)) {
          const ui: UIItem = {
            path: full,
            name,
            type: isSymlink ? 'symlink' : isDir ? 'directory' : 'file',
            size: statTarget.size ?? 0,
            modifiedAt: statTarget.mtimeMs ?? Date.now(),
            linkTarget: isSymlink
              ? await fs.promises.readlink(full).catch(() => '')
              : undefined,
          };
          results.push(ui);
          if (results.length >= maxResults) return results;
        }

        // 仅对真实目录继续 BFS（不跟随符号链接）
        if (isDir && !isSymlink) {
          queue.push(full);
        }
      } catch {
        // 忽略无法访问的项
      }
    }
  }
  return results;
}

// Render file list
function renderFileList(files: UIItem[], manualMode = false) {
  if (files.length === 0) {
    fileList.innerHTML = `
      <div class="empty-state">
        📭
        <p>当前目录为空</p>
      </div>
    `;
    return;
  }

  // 已在 listUIItems 中应用 sorter.applySort，这里不再排序

  lastRenderedFiles = files.slice();

  fileList.innerHTML = files
    .map((file) => {
      const icon =
        file.type === 'directory'
          ? '📁'
          : file.type === 'symlink'
            ? '🔗'
            : '📄';
      const size = file.type === 'file' ? formatFileSize(file.size) : '-';
      const date = new Date(file.modifiedAt).toLocaleString('zh-CN');
      const displayName =
        file.type === 'symlink' && file.linkTarget
          ? `${file.name} -> ${file.linkTarget}`
          : file.name;
      const metaExtra = file.type === 'symlink' ? '链接' : '';
      const safePath = escapeHtml(file.path);
      const safeName = escapeHtml(file.name);
      const isMountRoot = mountedPaths.has(file.path);

      return `
        <div class="file-item" data-path="${safePath}">
          <span class="file-icon">${icon}</span>
          <div class="file-info">
            <div class="file-name" onclick="handleFileClick('${safePath}', '${file.type}')">${escapeHtml(displayName)}</div>
            <div class="file-meta">${metaExtra ? metaExtra + ' | ' : ''}${size} | ${date}</div>
          </div>
          <div class="file-actions">
            ${file.type === 'file' ? `<button class="btn btn-primary btn-small" onclick="downloadFile('${safePath}')">下载</button>` : ''}
            <button class="btn btn-secondary btn-small" onclick="showDetails('${safePath}')">详情</button>
            ${!isMountRoot ? `<button class="btn btn-secondary btn-small" onclick="copyFile('${safePath}')">复制</button>` : ''}
            ${!isMountRoot ? `<button class="btn btn-secondary btn-small" onclick="cutFile('${safePath}')">剪切</button>` : ''}
            ${!isMountRoot ? `<button class="btn btn-danger btn-small" onclick="deleteFile('${safePath}')">删除</button>` : ''}
            ${
              manualMode && !isMountRoot
                ? `
              <span class="divider" style="margin:0 4px; color:#999">|</span>
              <button class="btn btn-secondary btn-small" onclick="moveUp('${safeName}')">上移</button>
              <button class="btn btn-secondary btn-small" onclick="moveDown('${safeName}')">下移</button>
            `
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');
}

// Handle file/folder click
window.handleFileClick = async (
  path: string,
  type: 'file' | 'directory' | 'symlink'
) => {
  try {
    if (type === 'directory') {
      currentPath = path;
      await refreshFileList();
      return;
    }
    if (type === 'symlink') {
      // 若指向目录则进入目录，否则忽略（可在详情/下载操作）
      const st = await fs.promises.stat(path);
      if (st.isDirectory()) {
        // 解析目标路径用于导航
        currentPath = await fs.promises.readlink(path).catch(() => path);
        await refreshFileList();
      }
      return;
    }
  } catch (e) {
    console.warn('handleFileClick failed', e);
  }
};

// 绑定搜索事件
if (searchBtn && searchInput) {
  searchBtn.addEventListener('click', async () => {
    const base = searchFromRoot && searchFromRoot.checked ? '/' : currentPath;
    await performSearch(searchInput.value, base);
  });
}

if (searchInput) {
  searchInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const base = searchFromRoot && searchFromRoot.checked ? '/' : currentPath;
      await performSearch(searchInput.value, base);
    }
  });
}

if (clearSearchBtn && searchInput) {
  clearSearchBtn.addEventListener('click', async () => {
    searchInput.value = '';
    if (searchStatus) searchStatus.textContent = '';
    await refreshFileList();
  });
}

// 绑定排序控件事件
if (sortModeSel) {
  sortModeSel.addEventListener('change', async () => {
    const mode = sortModeSel.value as SortMode;
    try {
      await sorter.setConfig(currentPath, { mode, order: currentSortOrder });
    } catch (e) {
      console.warn('setConfig(mode) failed', e);
    }
    await refreshFileList();
  });
}
if (sortOrderSel) {
  sortOrderSel.addEventListener('change', async () => {
    const order = sortOrderSel.value as SortOrder;
    try {
      await sorter.setConfig(currentPath, { mode: currentSortMode, order });
    } catch (e) {
      console.warn('setConfig(order) failed', e);
    }
    await refreshFileList();
  });
}

if (mountPluginSelect && webdavMountFields) {
  mountPluginSelect.addEventListener('change', () => {
    webdavMountFields.style.display =
      mountPluginSelect.value === 'webdav' ? 'block' : 'none';
  });
}

function resolveMountPath(input: string): {
  path: string | null;
  error: string | null;
} {
  const trimmed = input.trim();
  if (trimmed === '') return { path: null, error: '挂载路径不能为空' };
  if (!trimmed.startsWith('/')) {
    return {
      path: null,
      error: 'mountPath 必须是根目录下的一级路径，例如 /memory',
    };
  }
  let resolved = trimmed;
  if (resolved !== '/' && resolved.endsWith('/')) {
    resolved = resolved.slice(0, -1);
  }
  if (resolved.includes('//'))
    return { path: null, error: '挂载路径不能包含 // ' };
  const segments = resolved.split('/').filter(Boolean);
  for (const seg of segments) {
    if (seg === '.' || seg === '..')
      return { path: null, error: '挂载路径不能包含 . 或 .. 段' };
  }
  if (segments.length > 1) {
    return {
      path: null,
      error: 'mountPath 必须是根目录下的一级路径，例如 /memory',
    };
  }
  return { path: resolved, error: null };
}

function isMountedScopePath(targetPath: string, mountPath: string): boolean {
  return mountPath === '/'
    ? targetPath.startsWith('/')
    : targetPath === mountPath || targetPath.startsWith(`${mountPath}/`);
}

if (mountBtn) {
  mountBtn.addEventListener('click', async () => {
    const selectedPlugin = mountPluginSelect?.value || 'memory';
    const { path: mountPath, error } = resolveMountPath(
      mountPathInput?.value || ''
    );
    if (error || !mountPath) {
      if (mountStatus) mountStatus.textContent = error;
      return;
    }

    if (selectedPlugin === 'webdav') {
      const baseUrl = webdavUrlInput?.value.trim() || '';
      if (!baseUrl) {
        if (mountStatus) mountStatus.textContent = '错误：请输入 WebDAV URL';
        return;
      }
      try {
        new URL(baseUrl);
      } catch {
        if (mountStatus) mountStatus.textContent = '错误：无效的 URL';
        return;
      }
      const config: WebDAVDemoConfig = {
        baseUrl,
        username: webdavUsernameInput?.value.trim() || undefined,
        password: webdavPasswordInput?.value || undefined,
        token: webdavTokenInput?.value.trim() || undefined,
        remoteRoot: webdavRemoteRootInput?.value.trim() || undefined,
      };
      try {
        usePlugin('webdav', { mountPath, ...config });
        await fs.promises.readdir(mountPath);
        webDAVConfigStore.save(config);
        mountedPaths.set(mountPath, 'webdav');
        if (mountStatus)
          mountStatus.textContent = `已挂载: webdav -> ${mountPath}`;
        if (webdavStatus) webdavStatus.textContent = '已连接';
        currentPath = mountPath;
        await refreshFileList();
        await refreshStorageInfo();
      } catch (e) {
        try {
          unregisterPlugin('webdav');
        } catch {
          /* ignore */
        }
        if (mountStatus)
          mountStatus.textContent = `挂载失败: ${(e as Error).message}`;
        if (webdavStatus)
          webdavStatus.textContent = `连接失败: ${(e as Error).message}`;
      }
      return;
    }

    try {
      usePlugin(selectedPlugin, { mountPath });
      mountedPaths.set(mountPath, selectedPlugin);
      if (mountStatus)
        mountStatus.textContent = `已挂载: ${selectedPlugin} -> ${mountPath}`;
      currentPath = mountPath;
      await refreshFileList();
      await refreshStorageInfo();
    } catch (e) {
      if (mountStatus)
        mountStatus.textContent = `挂载失败: ${(e as Error).message}`;
    }
  });
}

if (webdavDisconnectBtn) {
  webdavDisconnectBtn.addEventListener('click', async () => {
    try {
      const entriesToRemove: Array<{ path: string; plugin: string }> = [];
      mountedPaths.forEach((plugin, path) => {
        if (isMountedScopePath(currentPath, path)) {
          entriesToRemove.push({ path, plugin });
        }
      });
      if (entriesToRemove.length === 0) {
        if (webdavStatus) webdavStatus.textContent = '当前路径下无挂载点';
        return;
      }
      for (const { plugin, path } of entriesToRemove) {
        try {
          unregisterPlugin(plugin);
        } catch {
          /* ignore if already unregistered */
        }
        mountedPaths.delete(path);
      }
      webDAVConfigStore.clear();
      if (webdavStatus) webdavStatus.textContent = '未连接';
      currentPath = '/';
      await refreshFileList();
    } catch (e) {
      if (webdavStatus)
        webdavStatus.textContent = `断开失败: ${(e as Error).message}`;
    }
  });
}

async function commitManualOrderFromView(newOrderNames: string[]) {
  try {
    await sorter.setManualOrder(currentPath, newOrderNames);
  } catch (e) {
    console.warn('setManualOrder failed', e);
  }
}

window.moveUp = async (name: string) => {
  if (currentSortMode !== 'manual') return;
  const order = lastRenderedFiles.map((f) => f.name);
  const idx = order.indexOf(name);
  if (idx <= 0) return;
  [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
  await commitManualOrderFromView(order);
  await refreshFileList();
};

window.moveDown = async (name: string) => {
  if (currentSortMode !== 'manual') return;
  const order = lastRenderedFiles.map((f) => f.name);
  const idx = order.indexOf(name);
  if (idx < 0 || idx >= order.length - 1) return;
  [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
  await commitManualOrderFromView(order);
  await refreshFileList();
};

// Download file
window.downloadFile = async (path: string) => {
  try {
    const content = await fs.promises.readFile(path);
    const blob = new Blob([content], {
      type: 'application/octet-stream',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = path.split('/').pop() || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Download failed:', error);
    alert(`下载失败: ${(error as Error).message}`);
  }
};

// Show details
window.showDetails = async (path: string) => {
  try {
    const lst = await fs.promises.lstat(path);
    const st = await fs.promises.stat(path).catch(() => lst);
    modalTitle.textContent = '文件详情';
    const name = path.split('/').pop() || '/';
    const parent = parentOf(path) || '根目录';
    const isLink =
      typeof lst.isSymbolicLink === 'function' && lst.isSymbolicLink();
    const typeText = isLink
      ? '软链接'
      : st.isDirectory()
        ? '文件夹'
        : st.isFile()
          ? '文件'
          : '其他';
    const nlink = await fs.promises.nlink(path).catch(() => 0);
    const linkTarget = isLink
      ? await fs.promises.readlink(path).catch(() => '')
      : '';

    const isDir = st.isDirectory();
    const initialSizeText = isDir
      ? 'Loading：计算中'
      : formatFileSize(st.size ?? 0);

    modalBody.innerHTML = `
      <p><strong>名称:</strong> ${escapeHtml(name)}</p>
      <p><strong>路径:</strong> ${escapeHtml(path)}</p>
      <p><strong>类型:</strong> ${typeText}</p>
      <p><strong>大小:</strong> <span id="details-size">${initialSizeText}</span></p>
      <p><strong>创建时间:</strong> ${new Date(st.birthtimeMs || 0).toLocaleString('zh-CN')}</p>
      <p><strong>修改时间:</strong> ${new Date(st.mtimeMs || 0).toLocaleString('zh-CN')}</p>
      <p><strong>父目录:</strong> ${escapeHtml(parent)}</p>
      ${isLink ? `<p><strong>链接目标:</strong> ${escapeHtml(linkTarget)}</p>` : ''}
      ${st.isFile() ? `<p><strong>硬链接计数:</strong> ${nlink}</p>` : ''}
    `;
    modal.classList.remove('hidden');

    // 如为目录，异步递归计算并更新显示
    if (isDir) {
      try {
        const total = await dirSizeRecursive(path);
        const el = document.getElementById('details-size');
        if (el) el.textContent = formatFileSize(total);
      } catch (e) {
        const el = document.getElementById('details-size');
        if (el) el.textContent = '计算失败';
      }
    }
  } catch (error) {
    console.error('Show details failed:', error);
    alert(`获取详情失败: ${(error as Error).message}`);
  }
};

// Copy file
window.copyFile = (path: string) => {
  clipboard = { type: 'copy', path };
  updateClipboardUI();
};

// Cut file
window.cutFile = (path: string) => {
  clipboard = { type: 'cut', path };
  updateClipboardUI();
};

// Delete a file
window.deleteFile = async (path: string) => {
  if (!confirm(`确定要删除 ${path} 吗？`)) return;

  try {
    await fs.promises.rm(path, { recursive: true, force: true });
    await refreshFileList();
    try {
      const dir = parentOf(path);
      const name = baseOf(path);
      await sorter.onEntriesRemoved(dir || '/', [name]);
    } catch (e) {
      void 0;
    }
    alert('删除成功');
  } catch (error) {
    console.error('Delete failed:', error);
    alert(`删除失败: ${(error as Error).message}`);
  }
};

// Update clipboard UI
function updateClipboardUI() {
  if (!clipboard) {
    clipboardInfo.innerHTML = '<span>无剪贴板内容</span>';
    clipboardInfo.classList.remove('active');
    pasteBtn.disabled = true;
  } else {
    const operation = clipboard.type === 'copy' ? '复制' : '剪切';
    clipboardInfo.innerHTML = `<span>${operation}: ${escapeHtml(clipboard.path)}</span>`;
    clipboardInfo.classList.add('active');
    pasteBtn.disabled = false;
  }
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Escape HTML
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Modal close
closeModal.addEventListener('click', () => {
  modal.classList.add('hidden');
});

modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    modal.classList.add('hidden');
  }
});

// Add a back button to navigate up
const backButton = document.createElement('button');
backButton.textContent = '← 返回上级';
backButton.className = 'btn btn-secondary';
backButton.style.marginBottom = '10px';
backButton.addEventListener('click', async () => {
  if (currentPath === '/') return;
  currentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
  await refreshFileList();
});
document.querySelector('.current-path')?.before(backButton);

(window as any).fs = fs;
(window as any).refreshFileList = refreshFileList;

// Initialize app
init();

// 申请持久化按钮
if (requestPersistBtn) {
  requestPersistBtn.addEventListener('click', async () => {
    try {
      const storage = navigator.storage;
      if (!storage || typeof storage.persist !== 'function') {
        alert('当前浏览器不支持持久化请求');
        return;
      }
      const before =
        typeof storage.persisted === 'function'
          ? await storage.persisted()
          : false;
      const ok = await storage.persist().catch(() => false);
      const after =
        typeof storage.persisted === 'function'
          ? await storage.persisted()
          : false;
      if (ok || after || before) {
        alert('已启用持久化存储');
      } else {
        alert('未授予持久化权限，可能需要满足 PWA/安装等条件');
      }
      await refreshStorageInfo();
    } catch (e) {
      console.error(e);
      alert('请求持久化失败');
    }
  });
}

// 仅在同源首次上传前提示持久化授权
async function ensurePersistenceBeforeUpload(): Promise<void> {
  const key = 'fs_demo_persist_prompted';
  const storage = navigator.storage;
  const persisted =
    typeof storage?.persisted === 'function'
      ? await storage.persisted()
      : false;
  if (persisted) {
    localStorage.setItem(key, '1');
    return;
  }
  if (localStorage.getItem(key) === '1') return;

  return new Promise<void>((resolve) => {
    modalTitle.textContent = '是否允许持久化存储？';
    modalBody.innerHTML = '';
    const desc = document.createElement('p');
    desc.textContent =
      '为避免浏览器在空间紧张时清理数据，建议开启持久化存储。我们将向浏览器请求“持久化”权限。';
    const actions = document.createElement('div');
    actions.style.marginTop = '12px';
    const agree = document.createElement('button');
    agree.className = 'btn btn-primary';
    agree.textContent = '同意并请求';
    const cancel = document.createElement('button');
    cancel.className = 'btn btn-secondary';
    cancel.style.marginLeft = '8px';
    cancel.textContent = '暂不';
    actions.appendChild(agree);
    actions.appendChild(cancel);
    modalBody.appendChild(desc);
    modalBody.appendChild(actions);
    modal.classList.remove('hidden');

    const cleanup = () => {
      modal.classList.add('hidden');
      agree.onclick = null;
      cancel.onclick = null;
    };

    agree.onclick = async () => {
      try {
        await new Promise<void>((res) => {
          fs.requestPersistentStorage((err: any, _ok?: boolean) => {
            if (err) {
              alert('请求持久化失败：' + (err?.message || err));
            }
            res();
          });
        });
      } catch (e) {
        void 0;
      }
      localStorage.setItem(key, '1');
      cleanup();
      await refreshStorageInfo();
      resolve();
    };
    cancel.onclick = () => {
      localStorage.setItem(key, '1');
      cleanup();
      resolve();
    };
  });
}

async function refreshStorageInfo() {
  try {
    const storage = navigator.storage;
    const persisted =
      typeof storage?.persisted === 'function'
        ? await storage.persisted()
        : false;
    if (persistStatusEl)
      persistStatusEl.textContent = persisted ? '已持久化' : '未持久化';

    const info = await fs.diskUsage()?.catch(() => null);
    if (info && usedSpaceEl && totalSpaceEl) {
      const total = info.total as number;
      const avail = info.available as number;
      const used = Math.max(0, total - avail);
      usedSpaceEl.textContent = formatFileSize(used);
      totalSpaceEl.textContent = formatFileSize(total);
    }
  } catch (e) {
    // ignore
  }
}

// Helpers
function parentOf(path: string): string {
  if (path === '/') return '';
  const idx = path.lastIndexOf('/');
  return idx <= 0 ? '/' : path.slice(0, idx);
}

function baseOf(path: string): string {
  if (path === '/') return '/';
  const idx = path.lastIndexOf('/');
  return path.slice(idx + 1);
}

async function listUIItems(dir: string): Promise<UIItem[]> {
  const dirents = (await fs.promises.readdir(dir, {
    withFileTypes: true,
  })) as Dirent[];
  const items: UIItem[] = [];
  for (const d of dirents) {
    const name = d.name;
    const full = dir === '/' ? `/${name}` : `${dir}/${name}`;
    try {
      const isSymlink = d.isSymbolicLink();
      const lst = isSymlink ? await fs.promises.lstat(full) : undefined;
      const st = (await fs.promises.stat(full).catch(() => undefined)) ?? lst;
      if (!st) continue;
      const linkTarget = isSymlink
        ? await fs.promises.readlink(full).catch(() => '')
        : '';
      const nlink = st.isFile()
        ? await fs.promises.nlink(full).catch(() => 0)
        : 0;
      items.push({
        path: full,
        name,
        type: isSymlink ? 'symlink' : st.isDirectory() ? 'directory' : 'file',
        size: st.size ?? 0,
        modifiedAt: st.mtimeMs ?? Date.now(),
        linkTarget: isSymlink ? linkTarget : undefined,
        nlink: nlink || undefined,
      });
    } catch {
      // ignore entries that fail stat
    }
  }
  // 应用排序（列表模式）
  try {
    const sorted = await sorter.applySort(dir, items, { view: 'list' });
    return sorted;
  } catch {
    return items;
  }
}

async function copyPath(src: string, dest: string): Promise<void> {
  const st = await fs.promises.stat(src);
  if (st.isDirectory()) {
    await fs.promises.mkdir(dest, { recursive: true });
    const dirents = await fs.promises.readdir(src, {
      withFileTypes: true,
    });
    for (const d of dirents) {
      const name = d.name as string;
      const childSrc = src === '/' ? `/${name}` : `${src}/${name}`;
      const childDest = dest === '/' ? `/${name}` : `${dest}/${name}`;
      await copyPath(childSrc, childDest);
    }
  } else {
    await fs.promises.copyFile(src, dest);
  }
}

// Recursively calculate the size of a directory. Skips symlinks to avoid cycles.
async function dirSizeRecursive(target: string): Promise<number> {
  try {
    const lst = await fs.promises.lstat(target);
    const st = await fs.promises.stat(target).catch(() => lst);
    if (st.isFile()) {
      return st.size ?? 0;
    }
    if (st.isDirectory()) {
      let total = 0;
      const dirents = (await fs.promises.readdir(target, {
        withFileTypes: true,
      })) as Dirent[];
      for (const d of dirents) {
        const name = d.name;
        const isSymlink = d.isSymbolicLink();
        if (isSymlink) continue;
        const child = target === '/' ? `/${name}` : `${target}/${name}`;
        if (d.isDirectory()) {
          total += await dirSizeRecursive(child);
        } else if (d.isFile()) {
          try {
            const cst = await fs.promises.stat(child);
            total += cst.size ?? 0;
          } catch (e) {
            void 0;
          }
        } else {
          // Fallback stat for unknown types
          try {
            const cst = await fs.promises.stat(child);
            if (cst.isFile()) total += cst.size ?? 0;
            else if (cst.isDirectory()) total += await dirSizeRecursive(child);
          } catch (e) {
            void 0;
          }
        }
      }
      return total;
    }
    return 0;
  } catch {
    return 0;
  }
}

// note: dirSizeRecursive 已实现于上方
