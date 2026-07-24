import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchElectron } from './helpers'

test.describe('Check Launch MarkText', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const { app: electronApp, page: firstPage } = await launchElectron()
    app = electronApp
    page = firstPage
  })

  test.afterAll(async() => {
    await app.close()
  })

  test('initializes an empty editor without losing bootstrap messages', async() => {
    await page.waitForFunction(
      () =>
        !document.querySelector('.editor-placeholder') &&
        !!document.querySelector('.editor-component, .recent-files-projects')
    )
    const title = await page.title()
    expect(/^MarkText|Untitled-1 - MarkText$/.test(title)).toBeTruthy()
    expect(await page.locator('.editor-placeholder').count()).toBe(0)
    expect(
      await page.evaluate(() =>
        performance.getEntriesByType('navigation').map((entry) => entry.toJSON().type)
      )
    ).toEqual(['navigate'])
  })
})
