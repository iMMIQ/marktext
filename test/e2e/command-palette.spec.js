const { expect, test } = require('@playwright/test')
const { launchElectron } = require('./helpers')

test('view menu opens the command palette and filters commands', async () => {
  const { app, page } = await launchElectron()

  try {
    await expect(page.locator('.editor-container')).toBeVisible()
    await expect(page.locator('.command-palette')).toBeAttached()

    await app.evaluate(({ BrowserWindow, Menu }) => {
      const win = BrowserWindow.getAllWindows()[0]
      const viewMenu = Menu.getApplicationMenu().items.find(item => item.label.replace('&', '') === 'View')
      const commandPaletteItem = viewMenu.submenu.items.find(item => item.label === 'Command Palette...')
      commandPaletteItem.click(undefined, win)
    })

    const palette = page.locator('.command-palette')
    await expect(page.locator('.el-dialog')).toBeVisible()

    const search = palette.locator('input.search')
    await expect(search).toBeVisible()
    await search.click()
    await page.keyboard.type('source code')

    await expect(palette.locator('ul.commands li.active')).toContainText('View: Toggle Source Code Mode')
  } finally {
    await app.close()
  }
})
