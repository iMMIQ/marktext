const { expect, test } = require('@playwright/test')
const { clickMenuItemByPath, getMenuItemChecked, launchElectron } = require('./helpers')

test('view menu toggles sidebar and tab bar layout', async () => {
  const { app, page } = await launchElectron()

  try {
    await expect(page.locator('.editor-container')).toBeVisible()
    await expect(page.locator('.side-bar')).toBeHidden()
    await expect(page.locator('.tabs-container')).toBeHidden()

    await clickMenuItemByPath(app, ['View', 'Show Sidebar'])
    await expect(page.locator('.side-bar')).toBeVisible()
    await expect.poll(() => getMenuItemChecked(app, 'sideBarMenuItem')).toBe(true)

    await clickMenuItemByPath(app, ['View', 'Show Tab Bar'])
    await expect(page.locator('.tabs-container')).toBeVisible()
    await expect.poll(() => getMenuItemChecked(app, 'tabBarMenuItem')).toBe(true)

    await clickMenuItemByPath(app, ['View', 'Show Sidebar'])
    await expect(page.locator('.side-bar')).toBeHidden()
    await expect.poll(() => getMenuItemChecked(app, 'sideBarMenuItem')).toBe(false)

    await clickMenuItemByPath(app, ['View', 'Show Tab Bar'])
    await expect(page.locator('.tabs-container')).toBeHidden()
    await expect.poll(() => getMenuItemChecked(app, 'tabBarMenuItem')).toBe(false)
  } finally {
    await app.close()
  }
})
