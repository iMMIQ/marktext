import { describe, expect, it, vi } from 'vitest'
import DocumentModel from '../../../src/muya/lib/contentState/documentModel'
import LayoutIndex from '../../../src/muya/lib/contentState/layoutIndex'
import RenderScheduler, { RenderPriority } from '../../../src/muya/lib/contentState/renderScheduler'
import ContentState from '../../../src/muya/lib/contentState'
import EventCenter from '../../../src/muya/lib/eventHandler/event'
import { MUYA_DEFAULT_OPTION } from '../../../src/muya/lib/config'

const createContentState = () => {
  const ctx = {
    blur: vi.fn(),
    container: document.createElement('div'),
    options: { ...MUYA_DEFAULT_OPTION }
  }
  ctx.eventCenter = new EventCenter()
  ctx.contentState = new ContentState(ctx, ctx.options)
  return ctx.contentState
}

const seedRootParagraphs = (contentState, count) => {
  contentState.blocks = Array.from({ length: count }, (_, index) => contentState.createBlockP(`paragraph ${index}`))
  contentState._linkRootBlocks()
  contentState._rebuildBlockMap()
  contentState._syncDocumentModels()
  contentState.cursor = {
    start: { key: contentState.blocks[0].children[0].key, offset: 0 },
    end: { key: contentState.blocks[0].children[0].key, offset: 0 },
    noHistory: true
  }
}

describe('editor document model', () => {
  it('indexes block content separately from transient render and layout state', () => {
    const root = {
      key: 'root',
      type: 'p',
      parent: null,
      preSibling: null,
      nextSibling: null,
      renderState: 'placeholder',
      estimatedHeight: 120,
      measuredHeight: 100,
      children: [{
        key: 'child',
        type: 'span',
        parent: 'root',
        preSibling: null,
        nextSibling: null,
        text: 'hello',
        renderState: 'rendered',
        children: []
      }]
    }
    const model = new DocumentModel()

    model.rebuildFromBlocks([root])

    expect(model.getRootIds()).toEqual(['root'])
    expect(model.getBlock('root')).toMatchObject({
      id: 'root',
      type: 'p',
      parentId: null,
      childIds: ['child'],
      prevId: null,
      nextId: null
    })
    expect(model.getBlock('child')).toMatchObject({
      id: 'child',
      text: 'hello',
      parentId: 'root'
    })
    expect(model.getBlock('root').attrs.renderState).toBeUndefined()
    expect(model.getBlock('root').attrs.estimatedHeight).toBeUndefined()
    expect(model.getBlock('root').attrs.measuredHeight).toBeUndefined()
  })
})

describe('editor layout index', () => {
  it('maps scroll offsets to block indexes and tracks measured heights', () => {
    const layout = new LayoutIndex()
    const blocks = [
      { key: 'a' },
      { key: 'b' },
      { key: 'c' }
    ]

    layout.rebuild(blocks, [
      { estimatedHeight: 10 },
      { estimatedHeight: 20 },
      { estimatedHeight: 30 }
    ])

    expect(layout.findIndexAtOffset(0)).toBe(0)
    expect(layout.findIndexAtOffset(11)).toBe(1)
    expect(layout.getTopForIndex(2)).toBe(30)

    layout.updateMeasuredHeight('b', 40)

    expect(layout.getHeight('b')).toBe(40)
    expect(layout.getTopForIndex(2)).toBe(50)
    expect(layout.getRangeForViewport(35, 10, 0)).toEqual([1, 3])

    layout.rebuild(blocks, [
      { estimatedHeight: 10 },
      { estimatedHeight: 20 },
      { estimatedHeight: 30 }
    ])

    expect(layout.getHeight('b')).toBe(40)
    expect(layout.getTopForIndex(2)).toBe(50)
  })

  it('uses a measured root height when rendering its viewport placeholder', async () => {
    const cs = await createContentState()
    seedRootParagraphs(cs, 3)
    const block = cs.blocks[1]

    cs.layoutIndex.updateMeasuredHeight(block.key, 52)

    expect(cs._getEstimatedHeight(block)).toBe(52)
  })
})

describe('editor render scheduler', () => {
  it('keeps render state out of blocks and cancels lower-priority work', () => {
    const scheduler = new RenderScheduler()

    scheduler.reset(['a', 'b', 'c'])
    scheduler.setDomState('a', 'placeholder')
    scheduler.setDomState('b', 'mounted')
    scheduler.enqueue(['a'], 'prefetch')
    scheduler.enqueue(['b'], 'viewport')
    scheduler.enqueue(['c'], 'cursor')
    scheduler.cancelLowerPriorityThan(RenderPriority.VIEWPORT)

    expect(scheduler.isPlaceholder('a')).toBe(true)
    expect(scheduler.getDomState('b')).toBe('mounted')
    expect(scheduler.flushNext().blockId).toBe('c')
    expect(scheduler.flushNext().blockId).toBe('b')
    expect(scheduler.flushNext()).toBe(null)
  })

  it('promotes queued work when a block becomes urgent', () => {
    const scheduler = new RenderScheduler()

    scheduler.reset(['a'])
    scheduler.enqueue(['a'], 'prefetch')
    scheduler.enqueue(['a'], 'viewport')

    const task = scheduler.flushNext()
    expect(task.blockId).toBe('a')
    expect(task.priority).toBe(RenderPriority.VIEWPORT)
    expect(scheduler.flushNext()).toBe(null)
  })
})

describe('content-state model integration', () => {
  it('keeps imported root blocks indexed in document, layout, and render registries', async () => {
    const { default: ContentState } = await import('../../../src/muya/lib/contentState')
    const { default: EventCenter } = await import('../../../src/muya/lib/eventHandler/event')
    const { MUYA_DEFAULT_OPTION } = await import('../../../src/muya/lib/config')
    const ctx = { options: { ...MUYA_DEFAULT_OPTION } }
    ctx.eventCenter = new EventCenter()
    ctx.contentState = new ContentState(ctx, ctx.options)
    const cs = ctx.contentState

    cs.importMarkdown('alpha\n\nbeta\n\ngamma', { initialPartitionCount: 20 })

    expect(cs.documentModel.getRootIds()).toEqual(cs.blocks.map(block => block.key))
    expect(cs.layoutIndex.nodes.map(node => node.blockId)).toEqual(cs.blocks.map(block => block.key))
    for (const block of cs.blocks) {
      expect(cs.renderScheduler.getState(block.key)).toBeTruthy()
      expect(block.renderState).toBeUndefined()
      expect(block.measuredHeight).toBeUndefined()
    }
  })

  it('drains scheduled placeholder blocks into mounted render state', async () => {
    const { default: ContentState } = await import('../../../src/muya/lib/contentState')
    const { default: EventCenter } = await import('../../../src/muya/lib/eventHandler/event')
    const { MUYA_DEFAULT_OPTION } = await import('../../../src/muya/lib/config')
    const ctx = { options: { ...MUYA_DEFAULT_OPTION } }
    ctx.eventCenter = new EventCenter()
    ctx.contentState = new ContentState(ctx, ctx.options)
    const cs = ctx.contentState

    cs.importMarkdown('alpha\n\nbeta\n\ngamma', { initialPartitionCount: 20 })
    const targetBlock = cs.blocks[1]
    cs.stateRender.singleRender = vi.fn()
    cs.postRender = vi.fn()
    cs._measureRenderedRootBlocks = vi.fn()
    cs._setRenderState([targetBlock], 'placeholder')
    cs.renderScheduler.enqueue([targetBlock.key], 'prefetch')
    document.body.innerHTML = `<pre id="${targetBlock.key}" class="ag-viewport-placeholder"></pre>`

    cs._drainRenderSchedulerQueue(1)

    expect(cs.stateRender.singleRender).toHaveBeenCalledWith(targetBlock, expect.any(Array), expect.any(Array))
    expect(cs.renderScheduler.getDomState(targetBlock.key)).toBe('mounted')
    expect(cs.postRender).toHaveBeenCalled()
    expect(cs._measureRenderedRootBlocks).toHaveBeenCalled()
    document.body.innerHTML = ''
  })

  it('renders a visible placeholder even after viewport state is promoted', async () => {
    const { default: ContentState } = await import('../../../src/muya/lib/contentState')
    const { default: EventCenter } = await import('../../../src/muya/lib/eventHandler/event')
    const { MUYA_DEFAULT_OPTION } = await import('../../../src/muya/lib/config')
    const ctx = { options: { ...MUYA_DEFAULT_OPTION } }
    ctx.eventCenter = new EventCenter()
    ctx.contentState = new ContentState(ctx, ctx.options)
    const cs = ctx.contentState

    cs.importMarkdown('alpha\n\nbeta\n\ngamma', { initialPartitionCount: 20 })
    const targetBlock = cs.blocks[1]
    cs.stateRender.singleRender = vi.fn()
    cs.postRender = vi.fn()
    cs._measureRenderedRootBlocks = vi.fn()
    cs._setRenderState([targetBlock], 'rendered')
    cs.renderScheduler.enqueue([targetBlock.key], 'viewport')
    document.body.innerHTML = `<pre id="${targetBlock.key}" class="ag-viewport-placeholder"></pre>`

    cs._drainRenderSchedulerQueue(1)

    expect(cs.stateRender.singleRender).toHaveBeenCalledWith(targetBlock, expect.any(Array), expect.any(Array))
    expect(cs.postRender).toHaveBeenCalled()
    expect(cs._measureRenderedRootBlocks).toHaveBeenCalled()
    document.body.innerHTML = ''
  })

  it('upgrades a pending idle render drain when viewport work becomes urgent', async () => {
    const { default: ContentState } = await import('../../../src/muya/lib/contentState')
    const { default: EventCenter } = await import('../../../src/muya/lib/eventHandler/event')
    const { MUYA_DEFAULT_OPTION } = await import('../../../src/muya/lib/config')
    const ctx = { options: { ...MUYA_DEFAULT_OPTION } }
    ctx.eventCenter = new EventCenter()
    ctx.contentState = new ContentState(ctx, ctx.options)
    const cs = ctx.contentState
    const idleCallbacks = []
    const frameCallbacks = []
    const originalRequestIdleCallback = window.requestIdleCallback
    const originalCancelIdleCallback = window.cancelIdleCallback
    const originalRequestAnimationFrame = window.requestAnimationFrame
    const originalCancelAnimationFrame = window.cancelAnimationFrame

    try {
      window.requestIdleCallback = vi.fn(callback => {
        idleCallbacks.push(callback)
        return idleCallbacks.length
      })
      window.cancelIdleCallback = vi.fn()
      window.requestAnimationFrame = vi.fn(callback => {
        frameCallbacks.push(callback)
        return frameCallbacks.length
      })
      window.cancelAnimationFrame = vi.fn()

      cs.renderScheduler.enqueue(['a'], 'prefetch')
      cs._scheduleRenderSchedulerDrain(false)
      expect(cs.renderSchedulerTask.type).toBe('idle')

      cs.renderScheduler.enqueue(['b'], 'viewport')
      cs._scheduleRenderSchedulerDrain(true)

      expect(window.cancelIdleCallback).toHaveBeenCalledWith(1)
      expect(cs.renderSchedulerTask.type).toBe('frame')
      expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)
      expect(frameCallbacks).toHaveLength(1)
    } finally {
      window.requestIdleCallback = originalRequestIdleCallback
      window.cancelIdleCallback = originalCancelIdleCallback
      window.requestAnimationFrame = originalRequestAnimationFrame
      window.cancelAnimationFrame = originalCancelAnimationFrame
    }
  })

  it('keeps an offscreen active cursor block without expanding the viewport range back to it', async () => {
    const cs = await createContentState()
    seedRootParagraphs(cs, 100)
    Object.defineProperty(cs.muya.container, 'clientHeight', {
      configurable: true,
      value: 240
    })
    cs.muya.container.scrollTop = 1800

    const [startIndex, endIndex] = cs._getVirtualRange()

    expect(startIndex).toBeGreaterThan(50)
    expect(endIndex - startIndex).toBeLessThan(40)
  })

  it('keeps offscreen blocks as placeholders without queueing full-document prefetch', async () => {
    const cs = await createContentState()
    seedRootParagraphs(cs, 100)
    Object.defineProperty(cs.muya.container, 'clientHeight', {
      configurable: true,
      value: 240
    })
    cs.muya.container.scrollTop = 1800

    const { startIndex, endIndex } = cs._applyVirtualizationState()

    expect(cs.renderScheduler.queue.filter(task => task.reason === 'prefetch')).toEqual([])
    expect(cs.renderScheduler.getDomState(cs.blocks[20].key)).toBe('placeholder')
    expect(cs.renderScheduler.queue.some(task => task.reason === 'cursor' && task.blockId === cs.blocks[0].key)).toBe(true)
    expect(cs.renderScheduler.queue.some(task => task.reason === 'viewport' && task.blockId === cs.blocks[startIndex].key)).toBe(true)
    expect(endIndex - startIndex).toBeLessThan(40)
  })

  it('patches viewport transitions without rendering the full document', async () => {
    const cs = await createContentState()
    seedRootParagraphs(cs, 3)
    const changedBlock = cs.blocks[1]
    cs.searchMatches = { matches: [], index: -1 }
    cs._getViewportAnchor = vi.fn(() => null)
    cs._applyVirtualizationState = vi.fn(() => ({
      startIndex: 1,
      endIndex: 2,
      changed: true,
      changedBlocks: [changedBlock]
    }))
    cs._measureRenderedRootBlocks = vi.fn()
    cs._scheduleUrgentPartitionHydration = vi.fn()
    cs.stateRender.collectLabels = vi.fn()
    cs.stateRender.render = vi.fn()
    cs.stateRender.renderBlocks = vi.fn()
    cs.postRender = vi.fn()

    cs.refreshViewport(false)

    expect(cs.stateRender.render).not.toHaveBeenCalled()
    expect(cs.stateRender.renderBlocks).toHaveBeenCalledWith([changedBlock], expect.any(Array), expect.any(Array))
  })

  it('resynchronizes document models after an edit replaces a root without changing the root count', async () => {
    const cs = await createContentState()
    seedRootParagraphs(cs, 3)
    const replacement = cs.createBlockP('replacement text')
    cs.blocks.splice(1, 1, replacement)
    cs._linkRootBlocks()
    cs.stateRender.collectLabels = vi.fn()
    cs.stateRender.partialRender = vi.fn()
    cs.postRender = vi.fn()
    cs.setCursor = vi.fn()

    cs.partialRender()

    expect(cs.documentModel.getRootIds()).toEqual(cs.blocks.map(block => block.key))
    expect(cs.documentModel.getBlock(replacement.children[0].key).text).toBe('replacement text')
    expect(cs.layoutIndex.nodes.map(node => node.blockId)).toEqual(cs.blocks.map(block => block.key))
  })
})
