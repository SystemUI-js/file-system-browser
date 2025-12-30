import { test, expect } from '@playwright/test';

test.describe('Demo Page', () => {
  test('should load demo page and display correct content', async ({
    page,
  }) => {
    // Navigate to the demo page
    await page.goto('/file-system-browser/');

    // Verify the page title
    await expect(page).toHaveTitle(/FileSystem Demo/);

    // Verify the main header is visible
    await expect(page.locator('h1')).toContainText('📁 FileSystem Demo');

    // Verify the description text
    await expect(page.locator('header p')).toContainText(
      'NodeJs fs 风格的浏览器文件存储系统'
    );

    // Verify key sections are visible
    await expect(page.locator('h2:has-text("上传文件")')).toBeVisible();
    await expect(page.locator('h2:has-text("文件列表")')).toBeVisible();
    await expect(page.locator('h2:has-text("剪贴板")')).toBeVisible();
    await expect(page.locator('h2:has-text("存储信息")')).toBeVisible();

    // Verify key buttons exist
    await expect(page.locator('#uploadBtn')).toBeVisible();
    await expect(page.locator('#createFolderBtn')).toBeVisible();
    await expect(page.locator('#clearAllBtn')).toBeVisible();

    // Verify file input exists
    await expect(page.locator('#fileInput')).toBeVisible();

    // Verify current path display
    await expect(page.locator('#currentPath')).toHaveText('/');

    // Verify storage status is displayed
    await expect(page.locator('#persistStatus')).toBeVisible();
  });

  test('should request persistent storage when clicking request persist button', async ({
    page,
  }) => {
    await page.goto('/file-system-browser/');

    // Set up dialog handler BEFORE clicking the button
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    // Click the request persist button
    await page.click('#requestPersistBtn');

    // Wait a bit for the dialog to appear and be handled
    await page.waitForTimeout(500);

    // After dialog is closed, check the persist status element is updated
    const persistStatus = page.locator('#persistStatus');
    await expect(persistStatus).toBeVisible();

    // Check the persist status text content (should show either '已持久化' or '未持久化')
    const statusText = await persistStatus.textContent();
    expect(statusText).toBeTruthy();
    expect(statusText).toMatch(/持久化/);

    // Check navigator.storage.persisted value via page evaluation
    const persistedResult = await page.evaluate(async () => {
      const storage = navigator.storage;
      if (typeof storage?.persisted === 'function') {
        return await storage.persisted();
      }
      return false;
    });

    // Verify the persisted result is a boolean (true or false)
    expect(typeof persistedResult).toBe('boolean');

    // Verify the status text matches the actual persisted state
    if (persistedResult) {
      expect(statusText).toContain('已持久化');
    } else {
      expect(statusText).toContain('未持久化');
    }
  });

  test('should display file operation buttons and controls', async ({
    page,
  }) => {
    await page.goto('/file-system-browser/');

    // Verify file operation buttons are visible
    await expect(page.locator('#createFolderBtn')).toBeVisible();
    await expect(page.locator('#clearAllBtn')).toBeVisible();

    // Verify file input is present
    await expect(page.locator('#fileInput')).toBeVisible();

    // Verify path navigation is displayed
    const currentPath = page.locator('#currentPath');
    await expect(currentPath).toBeVisible();
    await expect(currentPath).toHaveText('/');

    // Verify storage info elements are displayed
    await expect(page.locator('#persistStatus')).toBeVisible();
    await expect(page.locator('#usedSpace')).toBeVisible();
    await expect(page.locator('#totalSpace')).toBeVisible();

    // Verify search functionality elements
    await expect(page.locator('#searchInput')).toBeVisible();
    await expect(page.locator('#searchBtn')).toBeVisible();

    // Verify clipboard functionality
    await expect(page.locator('#pasteBtn')).toBeVisible();
    await expect(page.locator('#clipboardInfo')).toBeVisible();
  });
});
