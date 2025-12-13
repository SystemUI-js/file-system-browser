import { FileSystem, FileInfo } from '@system-ui-js/file-system-browser';

const fs = new FileSystem();
let currentPath = '/';
let clipboard: { type: 'copy' | 'cut'; path: string } | null = null;

// DOM elements
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const uploadBtn = document.getElementById('uploadBtn') as HTMLButtonElement;
const createFolderBtn = document.getElementById(
  'createFolderBtn'
) as HTMLButtonElement;
const clearAllBtn = document.getElementById('clearAllBtn') as HTMLButtonElement;
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

// Initialize
async function init() {
  try {
    await fs.init();
    console.log('FileSystem initialized');
    await refreshFileList();
  } catch (error) {
    console.error('Failed to initialize:', error);
    alert('初始化文件系统失败');
  }
}

// Upload files
uploadBtn.addEventListener('click', async () => {
  const files = fileInput.files;
  if (!files || files.length === 0) {
    alert('请选择文件');
    return;
  }

  try {
    for (const file of Array.from(files)) {
      const path = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
      await fs.put(path, file);
    }
    fileInput.value = '';
    await refreshFileList();
    alert(`成功上传 ${files.length} 个文件`);
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
    const path = currentPath === '/' ? `/${folderName}` : `${currentPath}/${folderName}`;
    await fs.mkdir(path);
    await refreshFileList();
    alert('文件夹创建成功');
  } catch (error) {
    console.error('Create folder failed:', error);
    alert(`创建文件夹失败: ${(error as Error).message}`);
  }
});

// Clear all files
clearAllBtn.addEventListener('click', async () => {
  if (!confirm('确定要清空所有文件吗？此操作不可撤销！')) return;

  try {
    await fs.clear();
    currentPath = '/';
    clipboard = null;
    updateClipboardUI();
    await refreshFileList();
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
    const destPath = currentPath === '/' ? `/${fileName}` : `${currentPath}/${fileName}`;

    if (clipboard.type === 'copy') {
      await fs.copy(clipboard.path, destPath);
      alert('复制成功');
    } else {
      await fs.move(clipboard.path, destPath);
      alert('移动成功');
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
    const files = await fs.propfind(currentPath);
    currentPathSpan.textContent = currentPath;
    renderFileList(files);
  } catch (error) {
    console.error('Refresh failed:', error);
    fileList.innerHTML = '<div class="empty-state">❌ 加载失败</div>';
  }
}

// Render file list
function renderFileList(files: FileInfo[]) {
  if (files.length === 0) {
    fileList.innerHTML = `
      <div class="empty-state">
        📭
        <p>当前目录为空</p>
      </div>
    `;
    return;
  }

  // Sort: directories first, then by name
  files.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  fileList.innerHTML = files
    .map((file) => {
      const icon = file.type === 'directory' ? '📁' : '📄';
      const size =
        file.type === 'file' ? formatFileSize(file.size) : '-';
      const date = new Date(file.modifiedAt).toLocaleString('zh-CN');

      return `
        <div class="file-item" data-path="${file.path}">
          <span class="file-icon">${icon}</span>
          <div class="file-info">
            <div class="file-name" onclick="handleFileClick('${escapeHtml(file.path)}', '${file.type}')">${escapeHtml(file.name)}</div>
            <div class="file-meta">${size} | ${date}</div>
          </div>
          <div class="file-actions">
            ${file.type === 'file' ? `<button class="btn btn-primary btn-small" onclick="downloadFile('${escapeHtml(file.path)}')">下载</button>` : ''}
            <button class="btn btn-secondary btn-small" onclick="showDetails('${escapeHtml(file.path)}')">详情</button>
            <button class="btn btn-secondary btn-small" onclick="copyFile('${escapeHtml(file.path)}')">复制</button>
            <button class="btn btn-secondary btn-small" onclick="cutFile('${escapeHtml(file.path)}')">剪切</button>
            <button class="btn btn-danger btn-small" onclick="deleteFile('${escapeHtml(file.path)}')">删除</button>
          </div>
        </div>
      `;
    })
    .join('');
}

// Handle file/folder click
(window as any).handleFileClick = async (path: string, type: string) => {
  if (type === 'directory') {
    currentPath = path;
    await refreshFileList();
  }
};

// Download file
(window as any).downloadFile = async (path: string) => {
  try {
    const content = await fs.get(path);
    if (!content) {
      alert('文件内容为空');
      return;
    }

    const stat = await fs.stat(path);
    const blob = new Blob([content], {
      type: stat?.mimeType || 'application/octet-stream',
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
(window as any).showDetails = async (path: string) => {
  try {
    const stat = await fs.stat(path);
    if (!stat) {
      alert('文件不存在');
      return;
    }

    modalTitle.textContent = '文件详情';
    modalBody.innerHTML = `
      <p><strong>名称:</strong> ${escapeHtml(stat.name)}</p>
      <p><strong>路径:</strong> ${escapeHtml(stat.path)}</p>
      <p><strong>类型:</strong> ${stat.type === 'file' ? '文件' : '文件夹'}</p>
      <p><strong>大小:</strong> ${formatFileSize(stat.size)}</p>
      ${stat.mimeType ? `<p><strong>MIME类型:</strong> ${escapeHtml(stat.mimeType)}</p>` : ''}
      <p><strong>创建时间:</strong> ${new Date(stat.createdAt).toLocaleString('zh-CN')}</p>
      <p><strong>修改时间:</strong> ${new Date(stat.modifiedAt).toLocaleString('zh-CN')}</p>
      <p><strong>父目录:</strong> ${escapeHtml(stat.parentPath) || '根目录'}</p>
    `;
    modal.classList.remove('hidden');
  } catch (error) {
    console.error('Show details failed:', error);
    alert(`获取详情失败: ${(error as Error).message}`);
  }
};

// Copy file
(window as any).copyFile = (path: string) => {
  clipboard = { type: 'copy', path };
  updateClipboardUI();
};

// Cut file
(window as any).cutFile = (path: string) => {
  clipboard = { type: 'cut', path };
  updateClipboardUI();
};

// Delete file
(window as any).deleteFile = async (path: string) => {
  if (!confirm(`确定要删除 ${path} 吗？`)) return;

  try {
    await fs.delete(path);
    await refreshFileList();
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
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
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

// Add back button to navigate up
const backButton = document.createElement('button');
backButton.textContent = '← 返回上级';
backButton.className = 'btn btn-secondary';
backButton.style.marginBottom = '10px';
backButton.addEventListener('click', async () => {
  if (currentPath === '/') return;
  const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
  currentPath = parentPath;
  await refreshFileList();
});
document.querySelector('.current-path')?.before(backButton);

// Initialize app
init();
