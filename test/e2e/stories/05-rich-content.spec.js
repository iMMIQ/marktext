const {
  expect,
  expectNoRendererErrors,
  test
} = require('../fixtures')

test.describe('US-05 rich Markdown', () => {
  test('[US-05.AC-01] renders representative GFM and math as an inspectable document', async ({ captureStory, launchApp, workspace }) => {
    const filePath = workspace.write('rich-content.md', [
      '# Release plan',
      '',
      'A [project link](https://github.com/marktext/marktext) with `inline code`.',
      '',
      '- [x] Draft complete',
      '- [ ] Publish release',
      '',
      '| Item | Status |',
      '| --- | --- |',
      '| Editor | Ready |',
      '',
      '```js',
      'const ready = true',
      '```',
      '',
      '$$',
      'e^{i\\pi}+1=0',
      '$$',
      ''
    ].join('\n'))
    const session = await launchApp([filePath])
    const { page } = session

    await expect(page.locator('.editor-component h1')).toContainText('Release plan')
    await expect(page.locator('.editor-component')).toContainText('Draft complete')
    await expect(page.locator('.editor-component table')).toContainText('Editor')
    await expect(page.locator('.editor-component pre[data-role="fencecode"]')).toContainText('const ready = true')
    await expect(page.locator('.ag-task-list-item-checkbox')).toHaveCount(2)
    await expect(page.locator('.ag-task-list-item-checkbox').first()).toBeChecked()
    await expect(page.locator('figure[data-role="MULTIPLEMATH"] .katex')).toBeVisible()

    await captureStory(page, 'US-05 rich markdown')
    expectNoRendererErrors(session)
  })

  test('[US-05.AC-02, US-05.AC-04] renders each diagram engine and isolates an invalid block', async ({ captureStory, launchApp, workspace }) => {
    const filePath = workspace.write('diagrams.md', [
      '# Diagram report',
      '',
      '```sequence',
      'Writer->Editor: Open draft',
      'Editor-->Writer: Render preview',
      '```',
      '',
      '```mermaid',
      'graph LR;',
      '  Draft-->Review;',
      '```',
      '',
      '```vega-lite',
      '{"width":320,"height":220,"data":{"values":[{"stage":"Draft","count":2},{"stage":"Review","count":5}]},"mark":"bar","encoding":{"x":{"field":"stage","type":"nominal"},"y":{"field":"count","type":"quantitative"}}}',
      '```',
      '',
      '```mermaid',
      'this is not valid mermaid syntax !!!',
      '```',
      '',
      'Content after the invalid diagram remains readable.',
      ''
    ].join('\n'))
    const session = await launchApp([filePath])
    const { page } = session

    const sequence = page.locator('figure[data-role="SEQUENCE"]')
    await expect(sequence.locator('svg.sequence')).toBeVisible({ timeout: 15000 })
    await expect(sequence).toContainText('Render preview')
    const mermaidPreviews = page.locator('figure[data-role="MERMAID"]')
    await expect(mermaidPreviews.first().locator('svg')).toBeVisible({ timeout: 15000 })
    await expect(mermaidPreviews.first().locator('svg text').filter({ hasText: 'Draft' })).toBeVisible()
    await expect(mermaidPreviews.first().locator('svg text').filter({ hasText: 'Review' })).toBeVisible()
    await expect(page.locator('figure[data-role="VEGA-LITE"] svg')).toBeVisible({ timeout: 15000 })
    await expect(mermaidPreviews.filter({ has: page.locator('.ag-math-error') })).toContainText('Invalid Mermaid Codes')
    await expect(page.locator('.editor-component')).toContainText('Content after the invalid diagram remains readable.')

    await page.locator('figure[data-role="VEGA-LITE"]').scrollIntoViewIfNeeded()
    await captureStory(page, 'US-05 diagrams')
    const invalidMermaid = mermaidPreviews.filter({ has: page.locator('.ag-math-error') })
    await invalidMermaid.scrollIntoViewIfNeeded()
    await captureStory(page, 'US-05 invalid diagram isolation')
    expectNoRendererErrors(session)
  })

  test('[US-05.AC-03] keeps link tools visible and inside the viewport', async ({ captureStory, launchApp, workspace }) => {
    const filePath = workspace.write('links.md', '# Links\n\n[MarkText project](https://github.com/marktext/marktext)\n')
    const session = await launchApp([filePath])
    const { page } = session

    await page.locator('.editor-component h1').click()
    const link = page.locator('a.ag-inline-rule').filter({ hasText: 'MarkText project' })
    const tools = page.locator('.ag-link-tools')
    await expect(tools).toHaveCount(1)
    await link.locator('span').filter({ hasText: 'MarkText project' }).first().dispatchEvent('mouseover')
    const readGeometry = () => page.evaluate(() => {
      const element = document.querySelector('.ag-link-tools')
      if (!element) return null
      const { x, y, width, height } = element.getBoundingClientRect()
      return {
        box: { x, y, width, height },
        viewport: { width: window.innerWidth, height: window.innerHeight }
      }
    })
    await expect.poll(async () => (await readGeometry())?.box.y).toBeGreaterThanOrEqual(0)
    const { box, viewport } = await readGeometry()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)

    await captureStory(page, 'US-05 link tools')
    expectNoRendererErrors(session)
  })
})
