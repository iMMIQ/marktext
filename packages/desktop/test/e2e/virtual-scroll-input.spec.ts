import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, waitForEditor } from './helpers'

const buildDocument = (paragraphs: number): string =>
  Array.from(
    { length: paragraphs },
    (_, index) => `Paragraph ${index}. ${'Scrollable content '.repeat(8)}`
  ).join('\n\n') + '\n'

const scrollTop = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const container = document.querySelector('.editor-component') as HTMLElement | null
    return container?.scrollTop ?? -1
  })

const wheelDown = async(page: Page): Promise<void> => {
  const editor = page.locator('.editor-component')
  const bounds = await editor.boundingBox()
  if (!bounds) throw new Error('Editor scroll container is not visible')

  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  for (let index = 0; index < 6; index++) {
    await page.mouse.wheel(0, 240)
    await page.waitForTimeout(50)
  }
}

const dragScrollbarDown = async(page: Page): Promise<void> => {
  const editor = page.locator('.editor-component')
  const bounds = await editor.boundingBox()
  if (!bounds) throw new Error('Editor scroll container is not visible')

  const x = bounds.x + bounds.width - 4
  const startY = bounds.y + 40
  await page.mouse.move(x, startY)
  await page.mouse.down()
  await page.mouse.move(x, bounds.y + bounds.height * 0.65, { steps: 8 })
  await page.mouse.up()
}

for (const paragraphs of [80, 3_000]) {
  test(`wheel and scrollbar remain responsive with ${paragraphs} paragraphs`, async() => {
    let app: ElectronApplication | undefined
    try {
      const launched = await launchWithMarkdown(buildDocument(paragraphs))
      app = launched.app
      const page = launched.page
      await waitForEditor(page)

      await wheelDown(page)
      await expect.poll(() => scrollTop(page), { timeout: 5_000 }).toBeGreaterThan(500)

      await page.evaluate(() => {
        const container = document.querySelector('.editor-component') as HTMLElement | null
        if (container) container.scrollTop = 0
      })
      await expect.poll(() => scrollTop(page)).toBe(0)
      await dragScrollbarDown(page)
      await expect.poll(() => scrollTop(page), { timeout: 5_000 }).toBeGreaterThan(500)
    } finally {
      await app?.close()
    }
  })
}
