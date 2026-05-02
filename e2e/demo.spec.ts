import { expect, type Page, test } from '@playwright/test';

// Helper type for window.fs access
interface WindowWithFs extends Window {
  fs: {
    promises: {
      writeFile: (path: string, data: string) => Promise<void>;
      mkdir: (path: string, opts: { recursive: boolean }) => Promise<void>;
      readFile: (path: string, encoding: string) => Promise<string>;
    };
  };
}


async function mountPlugin(
  page: Page,
  plugin: 'memory' | 'indexeddb' | 'webdav',
  mountPath: string,
  webdavConfig?: { url: string; username?: string; password?: string; token?: string; remoteRoot?: string }
): Promise<void> {
  await page.selectOption('#mountPluginSelect', plugin);
  await page.fill('#mountPathInput', mountPath);
  if (plugin === 'webdav' && webdavConfig) {
    if (webdavConfig.url) await page.fill('#webdavUrl', webdavConfig.url);
    if (webdavConfig.username) await page.fill('#webdavUsername', webdavConfig.username);
    if (webdavConfig.password) await page.fill('#webdavPassword', webdavConfig.password);
    if (webdavConfig.token) await page.fill('#webdavToken', webdavConfig.token);
    if (webdavConfig.remoteRoot) await page.fill('#webdavRemoteRoot', webdavConfig.remoteRoot);
  }
  await page.click('#mountBtn');
  await expect(page.locator('#currentPath')).toHaveText(mountPath);
}

async function writeFile(
  page: Page,
  filePath: string,
  content: string
): Promise<void> {
  await page.evaluate(
    async ({ filePath, content }) => {
      const fs = (window as unknown as WindowWithFs).fs;
      await fs.promises.writeFile(filePath, content);
    },
    { filePath, content }
  );
}

async function createFolder(page: Page, folderPath: string): Promise<void> {
  await page.evaluate(
    async ({ folderPath }) => {
      const fs = (window as unknown as WindowWithFs).fs;
      await fs.promises.mkdir(folderPath, { recursive: true });
    },
    { folderPath }
  );
}

async function openPath(page: Page, path: string): Promise<void> {
  await page.click(`.file-item[data-path="${path}"] .file-name`);
  await expect(page.locator('#currentPath')).toHaveText(path);
}

test.describe('Demo Page', () => {
  test('should load demo page and display correct content', async ({
    page,
  }) => {
    await page.goto('/file-system-browser/');

    await expect(page).toHaveTitle(/FileSystem Demo/);
    await expect(page.locator('h1')).toContainText('📁 FileSystem Demo');
    await expect(page.locator('header p')).toContainText(
      'NodeJs fs 风格的浏览器文件存储系统'
    );

    await expect(page.locator('h2:has-text("上传文件")')).toBeVisible();
    await expect(page.locator('h2:has-text("文件列表")')).toBeVisible();
    await expect(page.locator('h2:has-text("剪贴板")')).toBeVisible();
    await expect(page.locator('h2:has-text("存储信息")')).toBeVisible();
    await expect(page.locator('h2:has-text("挂载存储")')).toBeVisible();

    await expect(page.locator('#uploadBtn')).toBeVisible();
    await expect(page.locator('#createFolderBtn')).toBeVisible();
    await expect(page.locator('#clearAllBtn')).toBeVisible();
    await expect(page.locator('#fileInput')).toBeVisible();
    await expect(page.locator('#currentPath')).toHaveText('/');
    await expect(page.locator('#persistStatus')).toBeVisible();
  });

  test('should initialize file system without error', async ({ page }) => {
    await page.goto('/file-system-browser/');
    await page.waitForTimeout(500);
    await expect(page.locator('#fileList')).toBeVisible();
    await expect(page.locator('#currentPath')).toHaveText('/');
    await expect(
      page.locator('.file-item[data-path="/indexeddb"]')
    ).not.toBeVisible();
    await expect(
      page.locator('.file-item[data-path="/webdav"]')
    ).not.toBeVisible();
  });

  test('should manually mount memory storage', async ({ page }) => {
    await page.goto('/file-system-browser/');
    await page.waitForTimeout(500);

    await mountPlugin(page, 'memory', '/memory');

    await expect(page.locator('#mountStatus')).toContainText('已挂载: memory -> /memory');
    await expect(page.locator('#currentPath')).toHaveText('/memory');

    await writeFile(page, '/memory/hello.txt', 'hello');
    await page.evaluate(async () => {
      await (window as any).refreshFileList();
    });
    await expect(
      page.locator('.file-item:has-text("hello.txt")')
    ).toBeVisible();
  });

  test('should show error for invalid mount paths', async ({ page }) => {
    await page.goto('/file-system-browser/');
    await page.waitForTimeout(500);

    await page.fill('#mountPathInput', '');
    await page.click('#mountBtn');
    await expect(page.locator('#mountStatus')).toContainText('挂载路径不能为空');
    await expect(page.locator('#currentPath')).toHaveText('/');

    await page.fill('#mountPathInput', '/');
    await page.click('#mountBtn');
    await expect(page.locator('#mountStatus')).toContainText('不能挂载到根目录');
    await expect(page.locator('#currentPath')).toHaveText('/');

    await page.fill('#mountPathInput', '/foo/');
    await page.click('#mountBtn');
    await expect(page.locator('#mountStatus')).toContainText('已挂载');
    await expect(page.locator('#currentPath')).toHaveText('/foo');

    await page.fill('#mountPathInput', '//foo');
    await page.click('#mountBtn');
    await expect(page.locator('#mountStatus')).toContainText('挂载路径不能包含 //');
    await expect(page.locator('#currentPath')).toHaveText('/');

    await page.fill('#mountPathInput', '/foo/bar/..');
    await page.click('#mountBtn');
    await expect(page.locator('#mountStatus')).toContainText('挂载路径不能包含 . 或 .. 段');
    await expect(page.locator('#currentPath')).toHaveText('/');

    await page.fill('#mountPathInput', '/foo/./bar');
    await page.click('#mountBtn');
    await expect(page.locator('#mountStatus')).toContainText('挂载路径不能包含 . 或 .. 段');
    await expect(page.locator('#currentPath')).toHaveText('/');
  });

  test('should support relative mount paths resolved against current directory', async ({ page }) => {
    await page.goto('/file-system-browser/');
    await page.waitForTimeout(500);

    await mountPlugin(page, 'memory', '/memory');

    await page.fill('#mountPathInput', 'nested');
    await page.click('#mountBtn');
    await expect(page.locator('#mountStatus')).toContainText('已挂载: memory -> /memory/nested');
    await expect(page.locator('#currentPath')).toHaveText('/memory/nested');

    await writeFile(page, '/memory/outer.txt', 'outer');
    await writeFile(page, '/memory/nested/inner.txt', 'inner');

    const outerContent = await page.evaluate(async () => {
      const fs = (window as unknown as WindowWithFs).fs;
      return fs.promises.readFile('/memory/outer.txt', 'utf8');
    });
    expect(outerContent).toBe('outer');

    const innerContent = await page.evaluate(async () => {
      const fs = (window as unknown as WindowWithFs).fs;
      return fs.promises.readFile('/memory/nested/inner.txt', 'utf8');
    });
    expect(innerContent).toBe('inner');
  });

  test('should support nested memory mounts', async ({ page }) => {
    await page.goto('/file-system-browser/');
    await page.waitForTimeout(500);

    await mountPlugin(page, 'memory', '/memory');
    await mountPlugin(page, 'memory', '/memory/nested');

    await writeFile(page, '/memory/outer.txt', 'outer');
    await writeFile(page, '/memory/nested/inner.txt', 'inner');

    await page.click('button:has-text("← 返回上级")');
    await page.waitForTimeout(300);
    await expect(page.locator('#currentPath')).toHaveText('/memory');
    await expect(
      page.locator('.file-item:has-text("outer.txt")')
    ).toBeVisible();

    const outerContent = await page.evaluate(async () => {
      const fs = (window as unknown as WindowWithFs).fs;
      return fs.promises.readFile('/memory/outer.txt', 'utf8');
    });
    expect(outerContent).toBe('outer');

    const innerContent = await page.evaluate(async () => {
      const fs = (window as unknown as WindowWithFs).fs;
      return fs.promises.readFile('/memory/nested/inner.txt', 'utf8');
    });
    expect(innerContent).toBe('inner');
  });

  test('should connect and disconnect WebDAV mount through UI', async ({
    page,
  }) => {
    // Mock WebDAV responses
    await page.route('http://localhost:9974/mock-webdav/**', async (route) => {
      const request = route.request();
      const method = request.method();

      if (method === 'PROPFIND') {
        route.fulfill({
          status: 207,
          contentType: 'text/xml',
          body: `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/mock-webdav/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/></d:resourcetype>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`
        });
      } else {
        route.continue();
      }
    });
    await page.goto('/file-system-browser/');
    await page.waitForTimeout(500);

    await expect(page.locator('#webdavStatus')).toHaveText('未连接');
    await expect(
      page.locator('.file-item[data-path="/webdav"]')
    ).not.toBeVisible();

    await mountPlugin(page, 'webdav', '/webdav', {
      url: 'http://localhost:9974/mock-webdav',
    });

    await expect(page.locator('#mountStatus')).toContainText('已挂载: webdav -> /webdav');
    await expect(page.locator('#webdavStatus')).toHaveText('已连接');
    await expect(page.locator('#currentPath')).toHaveText('/webdav');

    await page.click('#webdavDisconnectBtn');

    await expect(page.locator('#webdavStatus')).toHaveText('未连接');
    await expect(
      page.locator('.file-item[data-path="/webdav"]')
    ).not.toBeVisible();
  });

  test('should disconnect memory mount and navigate back to root', async ({
    page,
  }) => {
    await page.goto('/file-system-browser/');
    await page.waitForTimeout(500);

    await mountPlugin(page, 'memory', '/memory');
    await expect(page.locator('#currentPath')).toHaveText('/memory');

    await page.click('#webdavDisconnectBtn');

    await expect(page.locator('#currentPath')).toHaveText('/');
    await expect(
      page.locator('.file-item[data-path="/memory"]')
    ).not.toBeVisible();
  });

  test('should show error when WebDAV connection fails', async ({
    page,
  }) => {
    await page.goto('/file-system-browser/');
    await page.waitForTimeout(500);

    await expect(page.locator('#webdavStatus')).toHaveText('未连接');
    await expect(
      page.locator('.file-item[data-path="/webdav"]')
    ).not.toBeVisible();

    await page.selectOption('#mountPluginSelect', 'webdav');
    await page.fill('#mountPathInput', '/webdav');
    await page.fill('#webdavUrl', 'http://localhost:59999/unreachable');
    await page.click('#mountBtn');
    await page.waitForTimeout(500);

    await expect(page.locator('#mountStatus')).toContainText('挂载失败');
    await expect(
      page.locator('.file-item[data-path="/webdav"]')
    ).not.toBeVisible();
  });


  test('should request persistent storage when clicking request persist button', async ({
    page,
  }) => {
    await page.goto('/file-system-browser/');

    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await page.click('#requestPersistBtn');

    // 等待 persistStatus 元素内容更新
    await page.waitForFunction(() => {
      const el = document.querySelector('#persistStatus');
      return (el?.textContent?.length ?? 0) > 0;
    });

    const persistStatus = page.locator('#persistStatus');
    await expect(persistStatus).toBeVisible();

    const statusText = await persistStatus.textContent();
    expect(statusText).toBeTruthy();

    const persistedResult = await page.evaluate(async () => {
      return (await navigator.storage?.persisted?.()) ?? false;
    });

    expect(typeof persistedResult).toBe('boolean');
  });
});

test.describe('Folder Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/file-system-browser/');
    await page.waitForTimeout(500);
    await mountPlugin(page, 'indexeddb', '/indexeddb');
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
  });

  test('should create a new folder', async ({ page }) => {
    const folderName = `test-folder-${Date.now()}`;

    page.removeAllListeners('dialog');

    let dialogCount = 0;
    page.on('dialog', async (dialog) => {
      if (dialogCount === 0) {
        expect(dialog.type()).toBe('prompt');
        expect(dialog.message()).toContain('请输入文件夹名称');
        await dialog.accept(folderName);
      } else {
        expect(dialog.message()).toContain('文件夹创建成功');
        await dialog.accept();
      }
      dialogCount++;
    });

    await page.click('#createFolderBtn');
    await page.waitForTimeout(500);

    await expect(
      page.locator(`.file-item:has-text("${folderName}")`)
    ).toBeVisible();

    const folderItem = page.locator(`.file-item:has-text("${folderName}")`);
    await expect(folderItem.locator('.file-icon')).toContainText('📁');
  });

  test('should navigate into a folder and back', async ({ page }) => {
    const folderName = `nav-test-folder-${Date.now()}`;

    page.removeAllListeners('dialog');

    let dialogCount = 0;
    page.on('dialog', async (dialog) => {
      if (dialogCount === 0) {
        await dialog.accept(folderName);
      } else {
        await dialog.accept();
      }
      dialogCount++;
    });

    await page.click('#createFolderBtn');
    await page.waitForTimeout(500);

    await expect(page.locator('#currentPath')).toHaveText('/indexeddb');

    await page.click(`.file-item:has-text("${folderName}") .file-name`);
    await page.waitForTimeout(300);

    await expect(page.locator('#currentPath')).toHaveText(
      `/indexeddb/${folderName}`
    );
    await expect(page.locator('.empty-state')).toBeVisible();

    await page.click('button:has-text("← 返回上级")');
    await page.waitForTimeout(300);

    await expect(page.locator('#currentPath')).toHaveText('/indexeddb');
    await expect(
      page.locator(`.file-item:has-text("${folderName}")`)
    ).toBeVisible();
  });
});

test.describe('File Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/file-system-browser/');
    await page.waitForTimeout(500);
    await mountPlugin(page, 'indexeddb', '/indexeddb');
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
  });

  test('should upload a file', async ({ page }) => {
    page.removeAllListeners('dialog');

    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    const testFileName = `test-file-${Date.now()}.txt`;
    const testContent = 'Hello, World!';

    await writeFile(page, `/indexeddb/${testFileName}`, testContent);

    await page.reload();
    await page.waitForTimeout(500);

    await mountPlugin(page, 'indexeddb', '/indexeddb');

    await expect(
      page.locator(`.file-item:has-text("${testFileName}")`)
    ).toBeVisible();

    const fileItem = page.locator(`.file-item:has-text("${testFileName}")`);
    await expect(fileItem.locator('.file-icon')).toContainText('📄');
  });

  test('should copy and paste a file', async ({ page }) => {
    page.removeAllListeners('dialog');

    const testFileName = `copy-test-${Date.now()}.txt`;
    await page.evaluate(
      async ({ fileName }) => {
        const fs = (
          window as unknown as {
            fs: {
              promises: {
                writeFile: (path: string, data: string) => Promise<void>;
                mkdir: (
                  path: string,
                  opts: { recursive: boolean }
                ) => Promise<void>;
              };
            };
          }
        ).fs;
        if (fs?.promises?.writeFile) {
          await fs.promises.writeFile(`/indexeddb/${fileName}`, 'test content');
          await fs.promises.mkdir('/indexeddb/target-folder', {
            recursive: true,
          });
        }
      },
      { fileName: testFileName }
    );

    await page.reload();
    await page.waitForTimeout(500);

    await mountPlugin(page, 'indexeddb', '/indexeddb');

    const fileItem = page.locator(`.file-item:has-text("${testFileName}")`);
    await fileItem.locator('button:has-text("复制")').click();
    await page.waitForTimeout(200);

    const clipboardInfo = page.locator('#clipboardInfo');
    await expect(clipboardInfo).toContainText('复制');
    await expect(clipboardInfo).toContainText(testFileName);

    await expect(page.locator('#pasteBtn')).not.toBeDisabled();

    await page.click('.file-item:has-text("target-folder") .file-name');
    await page.waitForTimeout(300);

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('复制成功');
      await dialog.accept();
    });

    await page.click('#pasteBtn');
    await page.waitForTimeout(500);

    await expect(
      page.locator(`.file-item:has-text("${testFileName}")`)
    ).toBeVisible();
  });

  test('should cut and paste a file (move)', async ({ page }) => {
    page.removeAllListeners('dialog');

    const testFileName = `cut-test-${Date.now()}.txt`;
    await page.evaluate(
      async ({ fileName }) => {
        const fs = (
          window as unknown as {
            fs: {
              promises: {
                writeFile: (path: string, data: string) => Promise<void>;
                mkdir: (
                  path: string,
                  opts: { recursive: boolean }
                ) => Promise<void>;
              };
            };
          }
        ).fs;
        if (fs?.promises?.writeFile) {
          await fs.promises.writeFile(`/indexeddb/${fileName}`, 'test content');
          await fs.promises.mkdir('/indexeddb/move-target', {
            recursive: true,
          });
        }
      },
      { fileName: testFileName }
    );

    await page.reload();
    await page.waitForTimeout(500);

    await mountPlugin(page, 'indexeddb', '/indexeddb');

    const fileItem = page.locator(`.file-item:has-text("${testFileName}")`);
    await fileItem.locator('button:has-text("剪切")').click();
    await page.waitForTimeout(200);

    const clipboardInfo = page.locator('#clipboardInfo');
    await expect(clipboardInfo).toContainText('剪切');
    await expect(clipboardInfo).toContainText(testFileName);

    await page.click('.file-item:has-text("move-target") .file-name');
    await page.waitForTimeout(300);

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('移动成功');
      await dialog.accept();
    });

    await page.click('#pasteBtn');
    await page.waitForTimeout(500);

    await expect(
      page.locator(`.file-item:has-text("${testFileName}")`)
    ).toBeVisible();

    await page.click('button:has-text("← 返回上级")');
    await page.waitForTimeout(300);

    await expect(
      page.locator(`#fileList .file-item .file-name:text("${testFileName}")`)
    ).not.toBeVisible();
  });

  test('should delete a file', async ({ page }) => {
    page.removeAllListeners('dialog');

    const testFileName = `delete-test-${Date.now()}.txt`;
    await page.evaluate(
      async ({ fileName }) => {
        const fs = (
          window as unknown as {
            fs: {
              promises: {
                writeFile: (path: string, data: string) => Promise<void>;
              };
            };
          }
        ).fs;
        if (fs?.promises?.writeFile) {
          await fs.promises.writeFile(`/indexeddb/${fileName}`, 'test content');
        }
      },
      { fileName: testFileName }
    );

    await page.reload();
    await page.waitForTimeout(500);

    await mountPlugin(page, 'indexeddb', '/indexeddb');

    await expect(
      page.locator(`.file-item:has-text("${testFileName}")`)
    ).toBeVisible();

    let dialogCount = 0;
    page.on('dialog', async (dialog) => {
      if (dialogCount === 0) {
        expect(dialog.message()).toContain('确定要删除');
        await dialog.accept();
      } else {
        expect(dialog.message()).toContain('删除成功');
        await dialog.accept();
      }
      dialogCount++;
    });

    const fileItem = page.locator(`.file-item:has-text("${testFileName}")`);
    await fileItem.locator('button:has-text("删除")').click();
    await page.waitForTimeout(500);

    await expect(
      page.locator(`.file-item:has-text("${testFileName}")`)
    ).not.toBeVisible();
  });
});

test.describe('File Details Modal', () => {
  test('should show file details in modal', async ({ page }) => {
    await page.goto('/file-system-browser/');
    await page.waitForTimeout(500);
    await mountPlugin(page, 'indexeddb', '/indexeddb');

    const testFileName = `details-test-${Date.now()}.txt`;
    const testContent = 'Test content for details';

    await page.evaluate(
      async ({ fileName, content }) => {
        const fs = (
          window as unknown as {
            fs: {
              promises: {
                writeFile: (path: string, data: string) => Promise<void>;
              };
            };
          }
        ).fs;
        if (fs?.promises?.writeFile) {
          await fs.promises.writeFile(`/indexeddb/${fileName}`, content);
        }
      },
      { fileName: testFileName, content: testContent }
    );

    await page.reload();
    await page.waitForTimeout(500);

    await mountPlugin(page, 'indexeddb', '/indexeddb');

    const fileItem = page.locator(`.file-item:has-text("${testFileName}")`);
    await fileItem.locator('button:has-text("详情")').click();
    await page.waitForTimeout(300);

    const modal = page.locator('#modal');
    await expect(modal).not.toHaveClass(/hidden/);

    await expect(page.locator('#modalTitle')).toContainText('文件详情');
    await expect(page.locator('#modalBody')).toContainText('名称');
    await expect(page.locator('#modalBody')).toContainText(testFileName);
    await expect(page.locator('#modalBody')).toContainText('类型');
    await expect(page.locator('#modalBody')).toContainText('文件');
    await expect(page.locator('#modalBody')).toContainText('大小');
    await expect(page.locator('#modalBody')).toContainText('创建时间');
    await expect(page.locator('#modalBody')).toContainText('修改时间');

    await page.click('.modal .close');
    await page.waitForTimeout(200);

    await expect(modal).toHaveClass(/hidden/);
  });

  test('should show folder details in modal', async ({ page }) => {
    await page.goto('/file-system-browser/');
    await page.waitForTimeout(500);
    await mountPlugin(page, 'indexeddb', '/indexeddb');
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    const folderName = `details-folder-${Date.now()}`;
    await createFolder(page, `/indexeddb/${folderName}`);

    await page.reload();
    await page.waitForTimeout(500);

    await mountPlugin(page, 'indexeddb', '/indexeddb');

    const folderItem = page.locator(`.file-item:has-text("${folderName}")`);
    await folderItem.locator('button:has-text("详情")').click();
    await page.waitForTimeout(300);

    await expect(page.locator('#modalBody')).toContainText('类型');
    await expect(page.locator('#modalBody')).toContainText('文件夹');

    await page.click('.modal .close');
  });
});

test.describe('Search Functionality', () => {
  test('should search for files', async ({ page }) => {
    await page.goto('/file-system-browser/');
    await page.waitForTimeout(500);
    await mountPlugin(page, 'indexeddb', '/indexeddb');

    const searchTerm = 'searchable';
    const matchingFile = `${searchTerm}-file-${Date.now()}.txt`;
    const nonMatchingFile = `other-file-${Date.now()}.txt`;

    await page.evaluate(
      async ({ matching, nonMatching }) => {
        const fs = (
          window as unknown as {
            fs: {
              promises: {
                writeFile: (path: string, data: string) => Promise<void>;
              };
            };
          }
        ).fs;
        if (fs?.promises?.writeFile) {
          await fs.promises.writeFile(
            `/indexeddb/${matching}`,
            'matching content'
          );
          await fs.promises.writeFile(
            `/indexeddb/${nonMatching}`,
            'other content'
          );
        }
      },
      { matching: matchingFile, nonMatching: nonMatchingFile }
    );

    await page.reload();
    await page.waitForTimeout(500);

    await mountPlugin(page, 'indexeddb', '/indexeddb');

    await expect(
      page.locator(`.file-item:has-text("${matchingFile}")`)
    ).toBeVisible();
    await expect(
      page.locator(`.file-item:has-text("${nonMatchingFile}")`)
    ).toBeVisible();

    await page.fill('#searchInput', searchTerm);
    await page.click('#searchBtn');
    await page.waitForTimeout(500);

    await expect(
      page.locator(`.file-item:has-text("${matchingFile}")`)
    ).toBeVisible();
    await expect(
      page.locator(`.file-item:has-text("${nonMatchingFile}")`)
    ).not.toBeVisible();

    await expect(page.locator('#searchStatus')).toContainText('找到');

    await page.click('#clearSearchBtn');
    await page.waitForTimeout(500);

    await expect(
      page.locator(`.file-item:has-text("${matchingFile}")`)
    ).toBeVisible();
    await expect(
      page.locator(`.file-item:has-text("${nonMatchingFile}")`)
    ).toBeVisible();
  });

  test('should search recursively from root when checkbox is checked', async ({
    page,
  }) => {
    await page.goto('/file-system-browser/');
    await page.waitForTimeout(500);
    await mountPlugin(page, 'indexeddb', '/indexeddb');

    const searchTerm = 'nested';
    const folderName = `search-folder-${Date.now()}`;
    const nestedFile = `${searchTerm}-file.txt`;

    await page.evaluate(
      async ({ folder, fileName }) => {
        const fs = (
          window as unknown as {
            fs: {
              promises: {
                writeFile: (path: string, data: string) => Promise<void>;
                mkdir: (
                  path: string,
                  opts: { recursive: boolean }
                ) => Promise<void>;
              };
            };
          }
        ).fs;
        if (fs?.promises?.writeFile && fs?.promises?.mkdir) {
          await fs.promises.mkdir(`/indexeddb/${folder}`, { recursive: true });
          await fs.promises.writeFile(
            `/indexeddb/${folder}/${fileName}`,
            'nested content'
          );
        }
      },
      { folder: folderName, fileName: nestedFile }
    );

    await page.reload();
    await page.waitForTimeout(500);

    await mountPlugin(page, 'indexeddb', '/indexeddb');

    await page.click(`.file-item:has-text("${folderName}") .file-name`);
    await page.waitForTimeout(300);

    await page.click('button:has-text("← 返回上级")');
    await page.waitForTimeout(300);

    await page.check('#searchFromRoot');

    await page.fill('#searchInput', searchTerm);
    await page.click('#searchBtn');
    await page.waitForTimeout(500);

    await expect(
      page.locator(`.file-item:has-text("${nestedFile}")`)
    ).toBeVisible();
  });
});

test.describe('Sort Functionality', () => {
  test('should sort files by name', async ({ page }) => {
    await page.goto('/file-system-browser/');
    await page.waitForTimeout(500);
    await mountPlugin(page, 'indexeddb', '/indexeddb');

    const suffix = Date.now();

    await page.evaluate(
      async ({ suffix }) => {
        const fs = (window as unknown as WindowWithFs).fs;
        if (fs?.promises?.writeFile) {
          await fs.promises.writeFile(
            `/indexeddb/z-file-${suffix}.txt`,
            'z content'
          );
          await fs.promises.writeFile(
            `/indexeddb/a-file-${suffix}.txt`,
            'a content'
          );
          await fs.promises.writeFile(
            `/indexeddb/m-file-${suffix}.txt`,
            'm content'
          );
        }
      },
      { suffix }
    );

    await page.reload();
    await page.waitForTimeout(500);

    await mountPlugin(page, 'indexeddb', '/indexeddb');

    await page.selectOption('#sortMode', 'name');
    await page.selectOption('#sortOrder', 'asc');
    await page.waitForTimeout(300);

    const fileNames = await page
      .locator('.file-item .file-name')
      .allTextContents();

    const testFiles = fileNames.filter(
      (name) =>
        name.includes(`a-file-${suffix}`) ||
        name.includes(`m-file-${suffix}`) ||
        name.includes(`z-file-${suffix}`)
    );

    const aIndex = testFiles.findIndex((n) => n.includes(`a-file-${suffix}`));
    const mIndex = testFiles.findIndex((n) => n.includes(`m-file-${suffix}`));
    const zIndex = testFiles.findIndex((n) => n.includes(`z-file-${suffix}`));

    expect(aIndex).toBeLessThan(mIndex);
    expect(mIndex).toBeLessThan(zIndex);
  });

  test('should sort files by size', async ({ page }) => {
    await page.goto('/file-system-browser/');
    await page.waitForTimeout(500);
    await mountPlugin(page, 'indexeddb', '/indexeddb');

    const suffix = Date.now();

    await page.evaluate(
      async ({ suffix }) => {
        const fs = (window as unknown as WindowWithFs).fs;
        if (fs?.promises?.writeFile) {
          await fs.promises.writeFile(`/indexeddb/small-${suffix}.txt`, 'x');
          await fs.promises.writeFile(
            `/indexeddb/medium-${suffix}.txt`,
            'x'.repeat(100)
          );
          await fs.promises.writeFile(
            `/indexeddb/large-${suffix}.txt`,
            'x'.repeat(1000)
          );
        }
      },
      { suffix }
    );

    await page.reload();
    await page.waitForTimeout(500);

    await mountPlugin(page, 'indexeddb', '/indexeddb');
    await page.waitForTimeout(500);

    await page.selectOption('#sortMode', 'size');
    await page.waitForTimeout(300);
    await page.selectOption('#sortOrder', 'desc');
    await page.waitForTimeout(800);

    const fileNames = await page
      .locator('.file-item .file-name')
      .allTextContents();

    const sizeFiles = fileNames.filter(
      (name) =>
        name === `small-${suffix}.txt` ||
        name === `medium-${suffix}.txt` ||
        name === `large-${suffix}.txt`
    );

    const largeIndex = sizeFiles.indexOf(`large-${suffix}.txt`);
    const mediumIndex = sizeFiles.indexOf(`medium-${suffix}.txt`);
    const smallIndex = sizeFiles.indexOf(`small-${suffix}.txt`);

    expect(largeIndex).toBeLessThan(mediumIndex);
    expect(mediumIndex).toBeLessThan(smallIndex);
  });
});

test.describe('Clear All Files', () => {
  test('should clear all files when confirmed', async ({ page }) => {
    await page.goto('/file-system-browser/');
    await page.waitForTimeout(500);
    await mountPlugin(page, 'indexeddb', '/indexeddb');

    await page.evaluate(async () => {
      const fs = (
        window as unknown as {
          fs: {
            promises: {
              writeFile: (path: string, data: string) => Promise<void>;
              mkdir: (
                path: string,
                opts: { recursive: boolean }
              ) => Promise<void>;
            };
          };
        }
      ).fs;
      if (fs?.promises?.writeFile && fs?.promises?.mkdir) {
        await fs.promises.writeFile('/indexeddb/clear-test-1.txt', 'content 1');
        await fs.promises.writeFile('/indexeddb/clear-test-2.txt', 'content 2');
        await fs.promises.mkdir('/indexeddb/clear-test-folder', {
          recursive: true,
        });
      }
    });

    await page.reload();
    await page.waitForTimeout(500);

    await mountPlugin(page, 'indexeddb', '/indexeddb');

    await expect(
      page.locator('.file-item:has-text("clear-test-1.txt")')
    ).toBeVisible();
    await expect(
      page.locator('.file-item:has-text("clear-test-2.txt")')
    ).toBeVisible();
    await expect(
      page.locator('.file-item:has-text("clear-test-folder")')
    ).toBeVisible();

    let dialogCount = 0;
    page.on('dialog', async (dialog) => {
      if (dialogCount === 0) {
        expect(dialog.message()).toContain('确定要清空');
        await dialog.accept();
      } else {
        expect(dialog.message()).toContain('所有文件已清空');
        await dialog.accept();
      }
      dialogCount++;
    });

    await page.click('#clearAllBtn');
    await page.waitForTimeout(500);

    await expect(page.locator('#currentPath')).toHaveText('/indexeddb');
    await expect(
      page.locator('.file-item:has-text("clear-test-1.txt")')
    ).not.toBeVisible();
    await expect(
      page.locator('.file-item:has-text("clear-test-2.txt")')
    ).not.toBeVisible();
    await expect(
      page.locator('.file-item:has-text("clear-test-folder")')
    ).not.toBeVisible();
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.empty-state')).toContainText('当前目录为空');
  });

  test('should not clear files when cancelled', async ({ page }) => {
    await page.goto('/file-system-browser/');
    await page.waitForTimeout(500);
    await mountPlugin(page, 'indexeddb', '/indexeddb');

    const testFileName = `dont-clear-${Date.now()}.txt`;
    await page.evaluate(
      async ({ fileName }) => {
        const fs = (
          window as unknown as {
            fs: {
              promises: {
                writeFile: (path: string, data: string) => Promise<void>;
              };
            };
          }
        ).fs;
        if (fs?.promises?.writeFile) {
          await fs.promises.writeFile(`/indexeddb/${fileName}`, 'content');
        }
      },
      { fileName: testFileName }
    );

    await page.reload();
    await page.waitForTimeout(500);

    await mountPlugin(page, 'indexeddb', '/indexeddb');

    page.once('dialog', async (dialog) => {
      await dialog.dismiss();
    });

    await page.click('#clearAllBtn');
    await page.waitForTimeout(500);

    await expect(
      page.locator(`.file-item:has-text("${testFileName}")`)
    ).toBeVisible();
  });
});

test.describe('Symlink Operations', () => {
  test('should create a symlink', async ({ page }) => {
    await page.goto('/file-system-browser/');
    await page.waitForTimeout(500);
    await mountPlugin(page, 'indexeddb', '/indexeddb');

    const targetFile = `symlink-target-${Date.now()}.txt`;
    await writeFile(page, `/indexeddb/${targetFile}`, 'target content');

    await page.reload();
    await page.waitForTimeout(500);

    await mountPlugin(page, 'indexeddb', '/indexeddb');

    const symlinkName = `test-symlink-${Date.now()}`;

    let promptCount = 0;
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        if (promptCount === 0) {
          await dialog.accept(`/indexeddb/${targetFile}`);
        } else {
          await dialog.accept(symlinkName);
        }
        promptCount++;
      } else {
        await dialog.accept();
      }
    });

    await page.click('#createSymlinkBtn');
    await page.waitForTimeout(1000);

    await expect(
      page.locator(`.file-item:has-text("${symlinkName}")`)
    ).toBeVisible();
    const symlinkItem = page.locator(`.file-item:has-text("${symlinkName}")`);
    await expect(symlinkItem.locator('.file-icon')).toContainText('🔗');
  });
});

test.describe('Storage Info', () => {
  test('should display storage information', async ({ page }) => {
    await page.goto('/file-system-browser/');
    await page.waitForTimeout(1000);

    await expect(page.locator('#persistStatus')).toBeVisible();
    await expect(page.locator('#usedSpace')).toBeVisible();
    await expect(page.locator('#totalSpace')).toBeVisible();

    const persistStatus = await page.locator('#persistStatus').textContent();
    expect(persistStatus).toBeTruthy();
    expect(
      persistStatus?.includes('已持久化') || persistStatus?.includes('未持久化')
    ).toBeTruthy();
  });
});