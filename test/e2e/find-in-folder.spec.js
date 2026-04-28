const { expect, test } = require('@playwright/test')
const { clickMenuItemByPath, launchElectron } = require('./helpers')

test('edit menu find in folder opens the sidebar search panel', async () => {
  const { app, page } = await launchElectron()

  try {
    await expect(page.locator('.editor-container')).toBeVisible()

    await clickMenuItemByPath(app, ['Edit', 'Find in Folder'])

    const searchPanel = page.locator('.side-bar-search')
    await expect(searchPanel).toBeVisible()
    await expect(searchPanel.locator('input[placeholder="Search in folder..."]')).toBeVisible()
    await expect(searchPanel.locator('.search-message-section')).toContainText('No folder open')
  } finally {
    await app.close()
  }
})
