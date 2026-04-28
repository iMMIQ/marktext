const { expect, test } = require('@playwright/test')
const { clickMenuItemByPath, launchElectron } = require('./helpers')

test('file menu creates and closes untitled tabs', async () => {
  const { app, page } = await launchElectron()

  try {
    const tabBar = page.locator('.tabs-container')
    const tabs = tabBar.locator('li')
    const activeTab = tabBar.locator('li.active')

    await expect(page.locator('.editor-container')).toBeVisible()
    await expect(tabBar).toBeHidden()

    await clickMenuItemByPath(app, ['File', 'New Tab'])

    await expect(tabBar).toBeVisible()
    await expect(tabs).toHaveCount(2)
    await expect(activeTab).toContainText('Untitled-2')

    await clickMenuItemByPath(app, ['File', 'Close Tab'])

    await expect(tabs).toHaveCount(1)
    await expect(activeTab).toContainText('Untitled-1')
    await expect(page.locator('.editor-container')).toBeVisible()
  } finally {
    await app.close()
  }
})
