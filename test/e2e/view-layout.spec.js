const { expect, test } = require('@playwright/test')
const { launchElectron } = require('./helpers')

const clickViewMenuItem = (app, label) => {
  return app.evaluate(({ BrowserWindow, Menu }, itemLabel) => {
    const win = BrowserWindow.getAllWindows()[0]
    const viewMenu = Menu.getApplicationMenu().items.find(item => item.label.replace('&', '') === 'View')
    const menuItem = viewMenu.submenu.items.find(item => item.label === itemLabel)
    menuItem.click(undefined, win)
  }, label)
}

const getMenuItemChecked = (app, id) => {
  return app.evaluate(({ Menu }, itemId) => {
    return Menu.getApplicationMenu().getMenuItemById(itemId).checked
  }, id)
}

test('view menu toggles sidebar and tab bar layout', async () => {
  const { app, page } = await launchElectron()

  try {
    await expect(page.locator('.editor-container')).toBeVisible()
    await expect(page.locator('.side-bar')).toBeHidden()
    await expect(page.locator('.tabs-container')).toBeHidden()

    await clickViewMenuItem(app, 'Show Sidebar')
    await expect(page.locator('.side-bar')).toBeVisible()
    await expect.poll(() => getMenuItemChecked(app, 'sideBarMenuItem')).toBe(true)

    await clickViewMenuItem(app, 'Show Tab Bar')
    await expect(page.locator('.tabs-container')).toBeVisible()
    await expect.poll(() => getMenuItemChecked(app, 'tabBarMenuItem')).toBe(true)

    await clickViewMenuItem(app, 'Show Sidebar')
    await expect(page.locator('.side-bar')).toBeHidden()
    await expect.poll(() => getMenuItemChecked(app, 'sideBarMenuItem')).toBe(false)

    await clickViewMenuItem(app, 'Show Tab Bar')
    await expect(page.locator('.tabs-container')).toBeHidden()
    await expect.poll(() => getMenuItemChecked(app, 'tabBarMenuItem')).toBe(false)
  } finally {
    await app.close()
  }
})
