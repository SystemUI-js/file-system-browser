import { test, expect, Page } from '@playwright/test';

// Helper type for window.fs access
interface WindowWithFs extends Window {
  fs: {
    promises: {
      writeFile: (path: string, data: string) => Promise<void>;
      mkdir: (path: string, opts: { recursive: boolean }) => Promise<void>;
    };
  };
}

// Helper function to write file via page evaluate
async function writeFile(
  page: Page,
  fileName: string,
  content: string
): Promise<void> {
  await page.evaluate(
    async ({ fileName, content }) => {
      const fs = (window as unknown as WindowWithFs).fs;
      if (fs?.promises?.writeFile) {
        await fs.promises.writeFile(`/${fileName}`, content);
      }
    },
    { fileName, content }
  );
}

// Helper function to create folder via page evaluate
async function createFolder(page: Page, folderName: string): Promise<void> {
  await page.evaluate(
    async ({ folder }) => {
      const fs = (window as unknown as WindowWithFs).fs;
      if (fs?.promises?.mkdir) {
        await fs.promises.mkdir(`/${folder}`, { recursive: true });
      }
    },
    { folder: folderName }
  );
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

    await expect(page.locator('#uploadBtn')).toBeVisible();
    await expect(page.locator('#createFolderBtn')).toBeVisible();
    await expect(page.locator('#clearAllBtn')).toBeVisible();
    await expect(page.locator('#fileInput')).toBeVisible();
    await expect(page.locator('#currentPath')).toHaveText('/');
    await expect(page.locator('#persistStatus')).toBeVisible();
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
      return el && el.textContent && el.textContent.length > 0;
    });

    const persistStatus = page.locator('#persistStatus');
    await expect(persistStatus).toBeVisible();

    const statusText = await persistStatus.textContent();
    expect(statusText).toBeTruthy();

    const persistedResult = await page.evaluate(async () => {
      const storage = navigator.storage;
      if (typeof storage?.persisted === 'function') {
        return await storage.persisted();
      }
      return false;
    });

    expect(persistedResult).toBe(true);
  });
});

test.describe('Folder Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/file-system-browser/');
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
  });

  test('should create a new folder', async ({ page }) => {
    const folderName = 'test-folder-' + Date.now();

    page.removeAllListeners('dialog');

    let dialogCount = 0;
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        if (dialogCount === 0) {
          expect(dialog.message()).toContain('请输入文件夹名称');
          await dialog.accept(folderName);
        }
      } else {
        expect(dialog.message()).toContain('文件夹创建成功');
        await dialog.accept();
      }
      dialogCount++;
    });

    await page.click('#createFolderBtn');

    await expect(
      page.locator(`.file-item:has-text("${folderName}")`)
    ).toBeVisible();

    const folderItem = page.locator(`.file-item:has-text("${folderName}")`);
    await expect(folderItem.locator('.file-icon')).toContainText('📁');
  });

  test('should navigate into a folder and back', async ({ page }) => {
    const folderName = 'nav-test-folder-' + Date.now();

    page.removeAllListeners('dialog');

    page.once('dialog', async (dialog) => {
      await dialog.accept(folderName);
    });
    await page.click('#createFolderBtn');
    await page.waitForTimeout(200);

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.waitForTimeout(500);

    await expect(page.locator('#currentPath')).toHaveText('/');

    await page.click(`.file-item:has-text("${folderName}") .file-name`);
    await page.waitForTimeout(300);

    await expect(page.locator('#currentPath')).toHaveText(`/${folderName}`);
    await expect(page.locator('.empty-state')).toBeVisible();

    await page.click('button:has-text("← 返回上级")');
    await page.waitForTimeout(300);

    await expect(page.locator('#currentPath')).toHaveText('/');
    await expect(
      page.locator(`.file-item:has-text("${folderName}")`)
    ).toBeVisible();
  });
});

test.describe('File Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/file-system-browser/');
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
  });

  test('should upload a file', async ({ page }) => {
    page.removeAllListeners('dialog');

    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    const testFileName = 'test-file-' + Date.now() + '.txt';
    const testContent = 'Hello, World!';

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
          await fs.promises.writeFile(`/${fileName}`, content);
        }
      },
      { fileName: testFileName, content: testContent }
    );

    await page.reload();
    await page.waitForTimeout(500);

    await expect(
      page.locator(`.file-item:has-text("${testFileName}")`)
    ).toBeVisible();

    const fileItem = page.locator(`.file-item:has-text("${testFileName}")`);
    await expect(fileItem.locator('.file-icon')).toContainText('📄');
  });

  test('should copy and paste a file', async ({ page }) => {
    page.removeAllListeners('dialog');

    const testFileName = 'copy-test-' + Date.now() + '.txt';
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
          await fs.promises.writeFile(`/${fileName}`, 'test content');
          await fs.promises.mkdir('/target-folder', { recursive: true });
        }
      },
      { fileName: testFileName }
    );

    await page.reload();
    await page.waitForTimeout(500);

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

    const testFileName = 'cut-test-' + Date.now() + '.txt';
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
          await fs.promises.writeFile(`/${fileName}`, 'test content');
          await fs.promises.mkdir('/move-target', { recursive: true });
        }
      },
      { fileName: testFileName }
    );

    await page.reload();
    await page.waitForTimeout(500);

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

    const testFileName = 'delete-test-' + Date.now() + '.txt';
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
          await fs.promises.writeFile(`/${fileName}`, 'test content');
        }
      },
      { fileName: testFileName }
    );

    await page.reload();
    await page.waitForTimeout(500);

    await expect(
      page.locator(`.file-item:has-text("${testFileName}")`)
    ).toBeVisible();

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('确定要删除');
      await dialog.accept();
    });

    const fileItem = page.locator(`.file-item:has-text("${testFileName}")`);
    await fileItem.locator('button:has-text("删除")').click();
    await page.waitForTimeout(200);

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('删除成功');
      await dialog.accept();
    });

    await page.waitForTimeout(500);

    await expect(
      page.locator(`.file-item:has-text("${testFileName}")`)
    ).not.toBeVisible();
  });
});

test.describe('File Details Modal', () => {
  test('should show file details in modal', async ({ page }) => {
    await page.goto('/file-system-browser/');

    const testFileName = 'details-test-' + Date.now() + '.txt';
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
          await fs.promises.writeFile(`/${fileName}`, content);
        }
      },
      { fileName: testFileName, content: testContent }
    );

    await page.reload();
    await page.waitForTimeout(500);

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
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    const folderName = 'details-folder-' + Date.now();
    await page.evaluate(
      async ({ folder }) => {
        const fs = (
          window as unknown as {
            fs: {
              promises: {
                mkdir: (
                  path: string,
                  opts: { recursive: boolean }
                ) => Promise<void>;
              };
            };
          }
        ).fs;
        if (fs?.promises?.mkdir) {
          await fs.promises.mkdir(`/${folder}`, { recursive: true });
        }
      },
      { folder: folderName }
    );

    await page.reload();
    await page.waitForTimeout(500);

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
          await fs.promises.writeFile(`/${matching}`, 'matching content');
          await fs.promises.writeFile(`/${nonMatching}`, 'other content');
        }
      },
      { matching: matchingFile, nonMatching: nonMatchingFile }
    );

    await page.reload();
    await page.waitForTimeout(500);

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

    const searchTerm = 'nested';
    const folderName = 'search-folder-' + Date.now();
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
          await fs.promises.mkdir(`/${folder}`, { recursive: true });
          await fs.promises.writeFile(
            `/${folder}/${fileName}`,
            'nested content'
          );
        }
      },
      { folder: folderName, fileName: nestedFile }
    );

    await page.reload();
    await page.waitForTimeout(500);

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

    const suffix = Date.now();

    await page.evaluate(
      async ({ suffix }) => {
        const fs = (window as unknown as WindowWithFs).fs;
        if (fs?.promises?.writeFile) {
          await fs.promises.writeFile(`/z-file-${suffix}.txt`, 'z content');
          await fs.promises.writeFile(`/a-file-${suffix}.txt`, 'a content');
          await fs.promises.writeFile(`/m-file-${suffix}.txt`, 'm content');
        }
      },
      { suffix }
    );

    await page.reload();
    await page.waitForTimeout(500);

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

    const suffix = Date.now();

    await page.evaluate(
      async ({ suffix }) => {
        const fs = (window as unknown as WindowWithFs).fs;
        if (fs?.promises?.writeFile) {
          await fs.promises.writeFile(`/small-${suffix}.txt`, 'x');
          await fs.promises.writeFile(`/medium-${suffix}.txt`, 'x'.repeat(100));
          await fs.promises.writeFile(`/large-${suffix}.txt`, 'x'.repeat(1000));
        }
      },
      { suffix }
    );

    await page.reload();
    await page.waitForTimeout(500);

    await page.selectOption('#sortMode', 'size');
    await page.selectOption('#sortOrder', 'desc');
    await page.waitForTimeout(300);

    const fileNames = await page
      .locator('.file-item .file-name')
      .allTextContents();

    const sizeFiles = fileNames.filter(
      (name) =>
        name === `small-${suffix}.txt` ||
        name === `medium-${suffix}.txt` ||
        name === `large-${suffix}.txt`
    );

    const largeIndex = sizeFiles.findIndex((n) => n === `large-${suffix}.txt`);
    const mediumIndex = sizeFiles.findIndex(
      (n) => n === `medium-${suffix}.txt`
    );
    const smallIndex = sizeFiles.findIndex((n) => n === `small-${suffix}.txt`);

    expect(largeIndex).toBeLessThan(mediumIndex);
    expect(mediumIndex).toBeLessThan(smallIndex);
  });
});

test.describe('Clear All Files', () => {
  test('should clear all files when confirmed', async ({ page }) => {
    await page.goto('/file-system-browser/');

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
        await fs.promises.writeFile('/clear-test-1.txt', 'content 1');
        await fs.promises.writeFile('/clear-test-2.txt', 'content 2');
        await fs.promises.mkdir('/clear-test-folder', { recursive: true });
      }
    });

    await page.reload();
    await page.waitForTimeout(500);

    await expect(
      page.locator('.file-item:has-text("clear-test-1.txt")')
    ).toBeVisible();
    await expect(
      page.locator('.file-item:has-text("clear-test-2.txt")')
    ).toBeVisible();
    await expect(
      page.locator('.file-item:has-text("clear-test-folder")')
    ).toBeVisible();

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('确定要清空所有文件吗');
      await dialog.accept();
    });

    await page.click('#clearAllBtn');
    await page.waitForTimeout(200);

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('所有文件已清空');
      await dialog.accept();
    });

    await page.waitForTimeout(500);

    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.empty-state')).toContainText('当前目录为空');
  });

  test('should not clear files when cancelled', async ({ page }) => {
    await page.goto('/file-system-browser/');

    const testFileName = 'dont-clear-' + Date.now() + '.txt';
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
          await fs.promises.writeFile(`/${fileName}`, 'content');
        }
      },
      { fileName: testFileName }
    );

    await page.reload();
    await page.waitForTimeout(500);

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

    const targetFile = 'symlink-target-' + Date.now() + '.txt';
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
          await fs.promises.writeFile(`/${fileName}`, 'target content');
        }
      },
      { fileName: targetFile }
    );

    await page.reload();
    await page.waitForTimeout(500);

    const symlinkName = 'test-symlink-' + Date.now();

    let promptCount = 0;
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        if (promptCount === 0) {
          await dialog.accept(`/${targetFile}`);
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
