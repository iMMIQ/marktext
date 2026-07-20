const {
  clickMenuItemByPath,
  expect,
  expectNoRendererErrors,
  getMainProcessCallCount,
  stubOpenDialog,
  test
} = require('../fixtures')

const getScaleState = page => page.evaluate(() => {
  const editor = document.querySelector('.editor-component')
  const root = document.querySelector('#ag-editor-id')
  const bounds = editor.getBoundingClientRect()
  const placeholders = Array.from(document.querySelectorAll('.ag-viewport-placeholder, .ag-partition-placeholder'))
  const visiblePlaceholders = placeholders.filter(element => {
    const rect = element.getBoundingClientRect()
    return rect.bottom > bounds.top + 1 && rect.top < bounds.bottom - 1
  })
  const rootChildren = root ? Array.from(root.children) : []
  return {
    bottomDistance: Math.max(0, editor.scrollHeight - editor.clientHeight - editor.scrollTop),
    clientHeight: editor.clientHeight,
    mountedRootCount: rootChildren.filter(element => {
      return !element.classList.contains('ag-viewport-placeholder') &&
        !element.classList.contains('ag-partition-placeholder')
    }).length,
    partitionPlaceholderCount: document.querySelectorAll('.ag-partition-placeholder').length,
    scrollHeight: editor.scrollHeight,
    scrollTop: editor.scrollTop,
    viewportPlaceholderCount: document.querySelectorAll('.ag-viewport-placeholder').length,
    visiblePlaceholderCount: visiblePlaceholders.length
  }
})

const scrollToRatio = (page, ratio) => page.evaluate(targetRatio => {
  const editor = document.querySelector('.editor-component')
  editor.scrollTop = (editor.scrollHeight - editor.clientHeight) * targetRatio
  editor.dispatchEvent(new Event('scroll'))
  return performance.now()
}, ratio)

const getVisibleScaleAnchor = page => page.evaluate(() => {
  const editorBounds = document.querySelector('.editor-component').getBoundingClientRect()
  let fallback = null
  for (const element of document.querySelectorAll('.ag-paragraph-content')) {
    const match = element.textContent.match(/^scale paragraph (\d+)/)
    if (!match) continue
    const bounds = element.getBoundingClientRect()
    if (bounds.bottom > editorBounds.top && bounds.top < editorBounds.bottom) {
      const anchor = {
        paragraphIndex: Number(match[1]),
        rootId: element.closest('.ag-paragraph').id,
        top: bounds.top - editorBounds.top,
        x: Math.max(editorBounds.left + 20, Math.min(bounds.left + 20, editorBounds.right - 20)),
        y: Math.max(editorBounds.top + 20, Math.min(bounds.top + (bounds.height / 2), editorBounds.bottom - 20))
      }
      if (bounds.top >= editorBounds.top + 1 && bounds.bottom <= editorBounds.bottom - 1) return anchor
      fallback = fallback || anchor
    }
  }
  return fallback
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

  test('[US-07.AC-02, US-07.AC-03, US-07.AC-04, US-07.AC-05] keeps a generated large document responsive through top, middle, bottom, edit, and undo', async ({ captureStory, launchApp, workspace }) => {
    test.slow()
    const paragraphCount = 6500
    const topToken = 'scale paragraph 00000'
    const editToken = `edit-${Date.now()}`
    const lines = ['# Generated scale document', '']
    for (let index = 0; index < paragraphCount; index++) {
      lines.push(
        `scale paragraph ${String(index).padStart(5, '0')} carries deterministic content for virtualized rendering, responsive scrolling, and editing verification.`,
        ''
      )
    }
    const markdown = lines.join('\n')
    expect(Buffer.byteLength(markdown)).toBeGreaterThanOrEqual(700 * 1024)
    const filePath = workspace.write('generated-large.md', markdown)
    const session = await launchApp()
    const { app, page } = session

    await stubOpenDialog(app, [filePath], '__longFileOpenCalls')
    await clickMenuItemByPath(app, ['File', 'Open File...'])
    await expect.poll(() => getMainProcessCallCount(app, '__longFileOpenCalls')).toBe(1)
    await expect(page.locator('.editor-component')).toContainText(topToken)
    await expect.poll(async () => (await getScaleState(page)).visiblePlaceholderCount).toBe(0)
    const topState = await getScaleState(page)
    expect(topState.partitionPlaceholderCount).toBeGreaterThan(0)
    expect(topState.mountedRootCount).toBeLessThan(250)
    await captureStory(page, 'US-07 long document top')

    const middleStartedAt = await scrollToRatio(page, 0.5)
    let middleAnchor = null
    await expect.poll(async () => {
      middleAnchor = await getVisibleScaleAnchor(page)
      return middleAnchor
    }, { timeout: 5000 }).not.toBeNull()
    await expect.poll(async () => (await getScaleState(page)).visiblePlaceholderCount, { timeout: 5000 }).toBe(0)
    const middleElapsed = await page.evaluate(startedAt => performance.now() - startedAt, middleStartedAt)
    const middleTopAfter = await page.locator(`#${middleAnchor.rootId}`).evaluate(element => {
      const editorBounds = document.querySelector('.editor-component').getBoundingClientRect()
      return element.getBoundingClientRect().top - editorBounds.top
    })
    const middleState = await getScaleState(page)
    expect(middleElapsed).toBeLessThan(5000)
    expect(middleAnchor.paragraphIndex).toBeGreaterThan(paragraphCount * 0.25)
    expect(middleAnchor.paragraphIndex).toBeLessThan(paragraphCount * 0.75)
    expect(Math.abs(middleTopAfter - middleAnchor.top)).toBeLessThanOrEqual(8)
    expect(middleState.partitionPlaceholderCount).toBeGreaterThan(0)
    expect(middleState.mountedRootCount).toBeLessThan(250)
    await captureStory(page, 'US-07 long document middle')

    await scrollToRatio(page, 1)
    let bottomAnchor = null
    await expect.poll(async () => {
      bottomAnchor = await getVisibleScaleAnchor(page)
      return bottomAnchor
    }, { timeout: 5000 }).not.toBeNull()
    await expect.poll(async () => (await getScaleState(page)).visiblePlaceholderCount, { timeout: 5000 }).toBe(0)
    bottomAnchor = await getVisibleScaleAnchor(page)
    expect(bottomAnchor).not.toBeNull()
    const bottomState = await getScaleState(page)
    expect(bottomAnchor.paragraphIndex).toBeGreaterThan(paragraphCount * 0.95)
    expect(bottomState.bottomDistance).toBeLessThanOrEqual(2)
    expect(bottomState.partitionPlaceholderCount).toBeGreaterThan(0)
    expect(bottomState.mountedRootCount).toBeLessThan(250)

    await captureStory(page, 'US-07 long document bottom')
    bottomAnchor = await getVisibleScaleAnchor(page)
    expect(bottomAnchor).not.toBeNull()
    await page.mouse.click(bottomAnchor.x, bottomAnchor.y)
    await page.keyboard.press('End')
    const editStartedAt = await page.evaluate(() => performance.now())
    await page.keyboard.type(` ${editToken}`)
    const editElapsed = await page.evaluate(startedAt => performance.now() - startedAt, editStartedAt)
    expect(editElapsed).toBeLessThan(1500)
    await expect(page.locator('.editor-component')).toContainText(editToken)
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+Z`)
    await expect(page.locator('.editor-component')).not.toContainText(editToken)
    const editedState = await getScaleState(page)
    expect(editedState.visiblePlaceholderCount).toBe(0)
    expect(editedState.partitionPlaceholderCount).toBeGreaterThan(0)
    expect(editedState.mountedRootCount).toBeLessThan(250)

    expectNoRendererErrors(session)
  })
})
