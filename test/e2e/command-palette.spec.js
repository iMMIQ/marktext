const { expect, test } = require('@playwright/test')
const { clickMenuItemByPath, launchElectron } = require('./helpers')

test('view menu opens the command palette and filters commands', async () => {
  const { app, page } = await launchElectron()

  try {
    await expect(page.locator('.editor-container')).toBeVisible()
    await expect(page.locator('.command-palette')).toBeAttached()

    await clickMenuItemByPath(app, ['View', 'Command Palette...'])

    const palette = page.locator('.command-palette')
    await expect(page.locator('.el-dialog')).toBeVisible()

    const search = palette.locator('input.search')
    await expect(search).toBeVisible()
    await search.fill('source code')

    await expect(palette.locator('ul.commands li.active')).toContainText('View: Toggle Source Code Mode')
  } finally {
    await app.close()
  }
})
