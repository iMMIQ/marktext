const fs = require('fs')
const path = require('path')
const { expect, test } = require('@playwright/test')
const { getMenuItemChecked, launchElectron } = require('./helpers')

test('general preferences persist and update the application menu', async () => {
  const { app, page } = await launchElectron()

  try {
    const userDataDir = await app.evaluate(({ app }) => app.getPath('userData'))
    const preferencesPath = path.join(userDataDir, 'preferences.json')

    await page.evaluate(() => {
      window.location.hash = '#/preference/general'
    })
    await expect(page.locator('.pref-container')).toBeVisible()
    await expect(page.locator('.pref-general')).toBeVisible()

    const autoSaveSwitch = page.locator('.pref-switch-item:has-text("Automatically save document changes") .el-switch')
    await expect(autoSaveSwitch).toHaveCount(1)
    await expect(autoSaveSwitch).not.toHaveClass(/is-checked/)

    await autoSaveSwitch.click()
    await expect(autoSaveSwitch).toHaveClass(/is-checked/)

    await expect.poll(() => {
      return JSON.parse(fs.readFileSync(preferencesPath, 'utf8')).autoSave
    }).toBe(true)

    const menuAutoSave = await getMenuItemChecked(app, 'autoSaveMenuItem')
    expect(menuAutoSave).toBe(true)
  } finally {
    await app.close()
  }
})
