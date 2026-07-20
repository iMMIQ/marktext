const {
  clickMenuItemByPath,
  expect,
  expectNoRendererErrors,
  getMainProcessCallCount,
  stubOpenDialog,
  test
} = require('../fixtures')

const getVisiblePlaceholders = page => page.evaluate(() => {
  const editor = document.querySelector('.editor-component')
  const bounds = editor.getBoundingClientRect()
  return Array.from(document.querySelectorAll('.ag-viewport-placeholder, .ag-partition-placeholder')).flatMap(element => {
    const rect = element.getBoundingClientRect()
    return rect.bottom > bounds.top && rect.top < bounds.bottom
      ? [{ className: element.className, height: rect.height, id: element.id, top: rect.top }]
      : []
  })
})

test.describe('US-07 safety and scale', () => {
  test('[US-07.AC-01] opens hostile Markdown without scripting, navigation, or a crash', async ({ captureStory, launchApp }) => {
    const session = await launchApp(['test/e2e/data/xss.md'])
    const { app, page } = session
    const initialUrl = page.url()

    await expect(page.locator('.editor-component')).toContainText('XSS Tests')
    const state = await page.evaluate(() => {
      return {
        dangerousElements: document.querySelectorAll('.editor-component script, .editor-component iframe, .editor-component embed, .editor-component webview').length,
        hasProcess: typeof window.process !== 'undefined',
        hasRequire: typeof window.require !== 'undefined',
        xssExecuted: window.__marktextXssExecuted === true
      }
    })
    const nativeState = await app.evaluate(({ BrowserWindow }) => ({
      crashed: BrowserWindow.getAllWindows()[0].webContents.isCrashed(),
      windowCount: BrowserWindow.getAllWindows().length
    }))

    expect(state.hasProcess).toBe(false)
    expect(state.hasRequire).toBe(false)
    expect(state.xssExecuted).toBe(false)
    expect(state.dangerousElements).toBe(0)
    expect(page.url()).toBe(initialUrl)
    expect(nativeState).toEqual({ crashed: false, windowCount: 1 })

    await captureStory(page, 'US-07 hostile document')
    expectNoRendererErrors(session)
  })

  test('[US-07.AC-02, US-07.AC-03] hydrates visible content while scrolling and survives undo in a long document', async ({ captureStory, launchApp, workspace }) => {
    const topToken = `top-${Date.now()}`
    const editToken = `edit-${Date.now()}`
    const lines = ['# Long document', '', topToken, '']
    for (let index = 1; index <= 180; index++) lines.push(`paragraph ${index}`, '')
    lines.push('target paragraph', '')
    const filePath = workspace.write('long.md', lines.join('\n'))
    const session = await launchApp()
    const { app, page } = session

    await stubOpenDialog(app, [filePath], '__longFileOpenCalls')
    await clickMenuItemByPath(app, ['File', 'Open File...'])
    await expect.poll(() => getMainProcessCallCount(app, '__longFileOpenCalls')).toBe(1)
    await expect(page.locator('.editor-component')).toContainText(topToken)
    await captureStory(page, 'US-07 long document top')

    await page.evaluate(() => {
      const editor = document.querySelector('.editor-component')
      editor.scrollTop = editor.scrollHeight
      editor.dispatchEvent(new Event('scroll'))
    })
    const target = page.locator('.ag-paragraph-content').filter({ hasText: 'target paragraph' })
    await expect(target).toBeVisible({ timeout: 15000 })
    expect(await getVisiblePlaceholders(page)).toEqual([])

    await target.click()
    expect(await getVisiblePlaceholders(page)).toEqual([])
    await page.keyboard.press('End')
    expect(await getVisiblePlaceholders(page)).toEqual([])
    await page.keyboard.type(` ${editToken}`)
    expect(await getVisiblePlaceholders(page)).toEqual([])
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+Z`)
    await expect(page.locator('.editor-component')).not.toContainText(editToken)
    await expect.poll(() => getVisiblePlaceholders(page)).toEqual([])
    await captureStory(page, 'US-07 long document bottom')

    expectNoRendererErrors(session)
  })
})
