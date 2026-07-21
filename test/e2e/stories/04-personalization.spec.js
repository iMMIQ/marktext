const fs = require('fs')
const path = require('path')
const {
  clickMenuItemById,
  clickMenuItemByPath,
  expect,
  expectNoRendererErrors,
  getMenuItemChecked,
  test
} = require('../fixtures')

test.describe('US-04 personalization', () => {
  test('[US-04.AC-01, US-04.AC-02] applies a theme, layout, and writing modes without obscuring the editor', async ({ captureStory, launchApp, workspace }) => {
    const filePath = workspace.write('focus.md', '# Focus\n\nFirst paragraph\n\nSecond paragraph\n')
    const session = await launchApp([filePath])
    const { app, page, userDataDir } = session
    const preferencesPath = path.join(userDataDir, 'preferences.json')

    await clickMenuItemById(app, 'one-dark')
    await expect.poll(() => JSON.parse(fs.readFileSync(preferencesPath, 'utf8')).theme).toBe('one-dark')
    await expect.poll(() => getMenuItemChecked(app, 'one-dark')).toBe(true)
    await expect.poll(() => page.evaluate(() => document.querySelector('#ag-theme')?.textContent.includes('--editorColor'))).toBe(true)

    await clickMenuItemByPath(app, ['View', 'Show Sidebar'])
    await clickMenuItemByPath(app, ['View', 'Show Tab Bar'])
    await expect(page.locator('.side-bar')).toBeVisible()
    await expect(page.locator('.tabs-container')).toBeVisible()

    await clickMenuItemByPath(app, ['View', 'Typewriter Mode'])
    await clickMenuItemByPath(app, ['View', 'Focus Mode'])
    await expect(page.locator('.editor-wrapper')).toHaveClass(/typewriter/)
    await expect(page.locator('.editor-wrapper')).toHaveClass(/focus/)
    await expect.poll(() => getMenuItemChecked(app, 'typewriterModeMenuItem')).toBe(true)
    await expect.poll(() => getMenuItemChecked(app, 'focusModeMenuItem')).toBe(true)

    const geometry = await page.evaluate(() => {
      const editor = document.querySelector('.editor-container').getBoundingClientRect()
      const editorMiddle = document.querySelector('.editor-middle').getBoundingClientRect()
      const sidebar = document.querySelector('.side-bar').getBoundingClientRect()
      return {
        editorMiddleLeft: editorMiddle.left,
        editorRight: editor.right,
        sidebarRight: sidebar.right,
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth
      }
    })
    expect(geometry.editorMiddleLeft).toBeGreaterThanOrEqual(geometry.sidebarRight - 1)
    expect(geometry.editorRight).toBeLessThanOrEqual(geometry.viewportWidth)
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth)
    const inactiveOpacity = await page.locator('.editor-component h1').evaluate(element => {
      return Number.parseFloat(getComputedStyle(element).opacity)
    })
    expect(inactiveOpacity).toBeGreaterThanOrEqual(0.55)

    await captureStory(page, 'US-04 dark workspace')
    expectNoRendererErrors(session)
  })

  test('[US-04.AC-03, US-04.AC-04] persists general preferences and keeps every category reachable', async ({ captureStory, launchApp }) => {
    const session = await launchApp()
    const { app, page, userDataDir } = session
    const preferencesPath = path.join(userDataDir, 'preferences.json')

    await page.evaluate(() => { window.location.hash = '#/preference/general' })
    await expect(page.locator('.pref-general')).toBeVisible()
    const autoSave = page.locator('.pref-switch-item:has-text("Automatically save document changes") .el-switch')
    await autoSave.click()
    await expect(autoSave).toHaveClass(/is-checked/)
    await expect.poll(() => JSON.parse(fs.readFileSync(preferencesPath, 'utf8')).autoSave).toBe(true)
    expect(await getMenuItemChecked(app, 'autoSaveMenuItem')).toBe(true)

    for (const category of ['editor', 'markdown', 'spelling', 'theme', 'image', 'keybindings']) {
      const errorCount = session.rendererErrors.length
      await page.evaluate(value => { window.location.hash = `#/preference/${value}` }, category)
      await expect(page.locator('.pref-setting')).toBeVisible()
      expect(session.rendererErrors, `Preference category "${category}" failed:\n${session.rendererErrors.join('\n')}`).toHaveLength(errorCount)
    }
    await page.evaluate(() => { window.location.hash = '#/preference/general' })
    await expect(page.locator('.pref-general')).toBeVisible()

    const hasHorizontalOverflow = await page.evaluate(() => {
      const container = document.querySelector('.pref-container')
      return container.scrollWidth > container.clientWidth + 1
    })
    expect(hasHorizontalOverflow).toBe(false)
    const sidebarGeometry = await page.evaluate(() => {
      const search = document.querySelector('.pref-sidebar .search-wrapper').getBoundingClientRect()
      const firstCategory = document.querySelector('.pref-sidebar .category .item').getBoundingClientRect()
      return {
        searchBottom: search.bottom,
        searchHeight: search.height,
        firstCategoryTop: firstCategory.top
      }
    })
    expect(sidebarGeometry.searchHeight).toBeLessThanOrEqual(36)
    expect(sidebarGeometry.firstCategoryTop).toBeGreaterThanOrEqual(sidebarGeometry.searchBottom)
    await captureStory(page, 'US-04 preferences')

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setContentSize(650, 500)
    })
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(650)
    const compactGeometry = await page.evaluate(() => {
      const sidebar = document.querySelector('.pref-sidebar').getBoundingClientRect()
      const content = document.querySelector('.pref-content').getBoundingClientRect()
      return {
        sidebarWidth: sidebar.width,
        sidebarRight: sidebar.right,
        contentLeft: content.left,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth
      }
    })
    expect(compactGeometry.sidebarWidth).toBeLessThanOrEqual(73)
    expect(compactGeometry.contentLeft).toBeGreaterThanOrEqual(compactGeometry.sidebarRight - 1)
    expect(compactGeometry.documentWidth).toBeLessThanOrEqual(compactGeometry.viewportWidth + 1)
    await expect(page.locator('.pref-sidebar .compact-label').first()).toBeVisible()
    await captureStory(page, 'US-04 compact preferences')
    expectNoRendererErrors(session)
  })
})
