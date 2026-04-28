const fs = require('fs')
const path = require('path')
const { expect, test } = require('@playwright/test')
const { launchElectron } = require('./helpers')

test('theme menu updates the persisted theme and menu selection', async () => {
  const { app, page } = await launchElectron()

  try {
    const userDataDir = await app.evaluate(({ app }) => app.getPath('userData'))
    const preferencesPath = path.join(userDataDir, 'preferences.json')

    await expect(page.locator('.editor-container')).toBeVisible()

    await app.evaluate(({ Menu }) => {
      const themeMenu = Menu.getApplicationMenu().getMenuItemById('themeMenu')
      const oneDarkItem = themeMenu.submenu.items.find(item => item.id === 'one-dark')
      oneDarkItem.click()
    })

    await expect.poll(() => {
      return JSON.parse(fs.readFileSync(preferencesPath, 'utf8')).theme
    }).toBe('one-dark')

    await expect.poll(() => {
      return app.evaluate(({ Menu }) => {
        return Menu.getApplicationMenu().getMenuItemById('one-dark').checked
      })
    }).toBe(true)

    await expect.poll(() => {
      return page.evaluate(() => {
        const themeStyle = document.querySelector('#ag-theme')
        return !!themeStyle && themeStyle.textContent.includes('--editorColor')
      })
    }).toBe(true)
  } finally {
    await app.close()
  }
})
