const { expect, test } = require('@playwright/test')
const { launchElectron } = require('./helpers')

test('edit menu find in folder opens the sidebar search panel', async () => {
  const { app, page } = await launchElectron()

  try {
    await expect(page.locator('.editor-container')).toBeVisible()

    await app.evaluate(({ BrowserWindow, Menu }) => {
      const win = BrowserWindow.getAllWindows()[0]
      const editMenu = Menu.getApplicationMenu().items.find(item => item.label.replace('&', '') === 'Edit')
      const findInFolderItem = editMenu.submenu.items.find(item => item.label === 'Find in Folder')
      findInFolderItem.click(undefined, win)
    })

    const searchPanel = page.locator('.side-bar-search')
    await expect(searchPanel).toBeVisible()
    await expect(searchPanel.locator('input[placeholder="Search in folder..."]')).toBeVisible()
    await expect(searchPanel.locator('.search-message-section')).toContainText('No folder open')
  } finally {
    await app.close()
  }
})
