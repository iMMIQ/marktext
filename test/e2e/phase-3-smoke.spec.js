const { expect, test } = require('@playwright/test')
const { launchElectron } = require('./helpers')

test('editor and preference shells load on the Vue 3 renderer', async () => {
  const { app, page } = await launchElectron()

  await expect(page.locator('.editor-container')).toBeVisible()
  await expect(page.locator('.ag-paragraph-content').first()).toBeVisible()
  await page.evaluate(() => {
    window.location.hash = '#/preference/general'
  })
  await expect(page.locator('.pref-container')).toBeVisible()

  await app.close()
})

test('editor renders opened file content', async () => {
  const { app, page } = await launchElectron(['test/e2e/data/xss.md'])

  await expect(page.locator('.editor-container')).toBeVisible()
  await expect(page.locator('.editor-component')).toContainText('XSS Tests')

  await app.close()
})

test('editor accepts typing in the paragraph content node', async () => {
  const { app, page } = await launchElectron()

  await expect(page.locator('.ag-paragraph-content').first()).toBeVisible()
  await page.locator('.ag-paragraph-content').first().click()
  await page.keyboard.type('smoke input')
  await expect(page.locator('.editor-component')).toContainText('smoke input')

  await app.close()
})
