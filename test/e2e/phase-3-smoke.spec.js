const { expect, test } = require('@playwright/test')
const { launchElectron } = require('./helpers')

test('editor and preference shells load on the Vue 3 renderer', async () => {
  const { app, page } = await launchElectron()

  await expect(page.locator('.editor-container')).toBeVisible()
  await page.evaluate(() => {
    window.location.hash = '#/preference/general'
  })
  await expect(page.locator('.pref-container')).toBeVisible()

  await app.close()
})
