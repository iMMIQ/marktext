import { describe, expect, it, vi } from 'vitest'
import ContentState from '../../../src/muya/lib/contentState'
import EventCenter from '../../../src/muya/lib/eventHandler/event'
import { MUYA_DEFAULT_OPTION } from '../../../src/muya/lib/config'

const createMuyaContext = () => {
  const ctx = {}
  ctx.options = Object.assign({}, MUYA_DEFAULT_OPTION)
  ctx.eventCenter = new EventCenter()
  ctx.container = document.createElement('div')
  ctx.contentState = new ContentState(ctx, ctx.options)
  return ctx
}

const createPartition = (index, startOffset, endOffset) => ({
  id: `partition-0-${index}`,
  startOffset,
  endOffset,
  startLine: index,
  endLine: index,
  typeHint: 'paragraph',
  version: 0,
  estimatedHeight: 24,
  measuredHeight: null,
  parseState: 'pending',
  renderState: 'pending'
})

describe('partition hydration priority', () => {
  it('picks the chunk nearest the current viewport instead of the first placeholder', () => {
    const ctx = createMuyaContext()
    const contentState = ctx.contentState
    const partitionMap = Array.from({ length: 200 }, (_, i) => createPartition(i, i * 10, (i + 1) * 10))

    contentState.partitionMap = partitionMap
    contentState.blocks = [
      {
        key: 'top-block',
        functionType: 'p',
        renderState: 'rendered',
        estimatedHeight: 1000
      },
      {
        key: 'tail-placeholder',
        functionType: 'partitionPlaceholder',
        renderState: 'rendered',
        estimatedHeight: 2400,
        rawStartOffset: partitionMap[100].startOffset,
        rawEndOffset: partitionMap[199].endOffset,
        partitionStartIndex: 100,
        partitionEndIndex: 200
      }
    ]

    contentState.getActiveBlocks = () => []
    Object.defineProperty(contentState.muya.container, 'clientHeight', {
      configurable: true,
      value: 800
    })
    contentState.muya.container.scrollTop = 1500

    const target = contentState._selectPartitionHydrationTarget(24)

    expect(target.block.key).to.equal('tail-placeholder')
    expect(target.chunkStartIndex).to.equal(126)
    expect(target.chunkEndIndex).to.equal(150)
    expect(target.chunkStartOffset).to.equal(1260)
    expect(target.chunkEndOffset).to.equal(1500)
  })

  it('re-queues partition hydration immediately after a viewport refresh', () => {
    const ctx = createMuyaContext()
    const contentState = ctx.contentState

    contentState.blocks = [
      {
        key: 'top-block',
        functionType: 'p',
        renderState: 'rendered',
        estimatedHeight: 1000
      },
      {
        key: 'tail-placeholder',
        functionType: 'partitionPlaceholder',
        renderState: 'rendered',
        estimatedHeight: 2400
      }
    ]
    contentState.searchMatches = { matches: [], index: -1 }
    contentState.getActiveBlocks = () => []
    contentState._getViewportAnchor = vi.fn(() => null)
    contentState._applyVirtualizationState = vi.fn(() => ({ startIndex: 0, endIndex: 2, changed: false }))
    contentState._measureRenderedRootBlocks = vi.fn()
    contentState._restoreViewportAnchor = vi.fn()
    contentState.postRender = vi.fn()
    contentState.stateRender.collectLabels = vi.fn()
    contentState.stateRender.render = vi.fn()
    contentState._scheduleUrgentPartitionHydration = vi.fn()

    contentState.refreshViewport(false)

    expect(contentState.stateRender.render).not.toHaveBeenCalled()
    expect(contentState._measureRenderedRootBlocks).toHaveBeenCalled()
    expect(contentState._scheduleUrgentPartitionHydration).toHaveBeenCalledWith(24)
  })

  it('keeps an urgent hydration task alive across repeated scroll triggers', () => {
    const ctx = createMuyaContext()
    const contentState = ctx.contentState
    const rafCallbacks = []
    const originalRequestAnimationFrame = window.requestAnimationFrame
    const originalCancelAnimationFrame = window.cancelAnimationFrame
    try {
      window.requestAnimationFrame = vi.fn(callback => {
        rafCallbacks.push(callback)
        return rafCallbacks.length
      })
      window.cancelAnimationFrame = vi.fn()

      contentState.blocks = [
        {
          key: 'top-block',
          functionType: 'p',
          renderState: 'rendered',
          estimatedHeight: 1000
        },
        {
          key: 'tail-placeholder',
          functionType: 'partitionPlaceholder',
          renderState: 'rendered',
          estimatedHeight: 2400,
          rawStartOffset: 0,
          rawEndOffset: 2400,
          partitionStartIndex: 0,
          partitionEndIndex: 100
        }
      ]
      contentState.partitionMap = Array.from({ length: 100 }, (_, i) => createPartition(i, i * 24, (i + 1) * 24))
      contentState._hydratePartitionChunk = vi.fn(() => null)

      contentState._scheduleUrgentPartitionHydration(6)
      contentState._scheduleUrgentPartitionHydration(6)

      expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)
      expect(window.cancelAnimationFrame).not.toHaveBeenCalled()
      expect(contentState.urgentPartitionHydrationTask).not.toBeNull()
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame
      window.cancelAnimationFrame = originalCancelAnimationFrame
    }
  })

  it('promotes urgent hydration after the current in-flight chunk finishes', async () => {
    const ctx = createMuyaContext()
    const contentState = ctx.contentState
    const rafCallbacks = []
    const originalRequestAnimationFrame = window.requestAnimationFrame
    const originalCancelAnimationFrame = window.cancelAnimationFrame
    let resolveParse

    try {
      window.requestAnimationFrame = vi.fn(callback => {
        rafCallbacks.push(callback)
        return rafCallbacks.length
      })
      window.cancelAnimationFrame = vi.fn()

      const placeholder = {
        key: 'tail-placeholder',
        functionType: 'partitionPlaceholder',
        renderState: 'rendered',
        estimatedHeight: 2400,
        rawStartOffset: 0,
        rawEndOffset: 2400,
        partitionStartIndex: 0,
        partitionEndIndex: 100
      }
      contentState.blocks = [placeholder]
      contentState.partitionMap = Array.from({ length: 100 }, (_, i) => createPartition(i, i * 24, (i + 1) * 24))
      contentState.partitionVersion = 1
      contentState.partitionHydrationRunId = 2
      contentState.canonicalMarkdown = 'x'.repeat(2400)
      contentState._selectPartitionHydrationTarget = vi.fn(() => ({
        block: placeholder,
        chunkStartIndex: 0,
        chunkEndIndex: 6,
        chunkStartOffset: 0,
        chunkEndOffset: 144,
        beforePlaceholder: null,
        afterPlaceholder: null,
        viewportDistance: 0
      }))
      contentState._parsePartitionMarkdown = vi.fn(() => new Promise(resolve => {
        resolveParse = resolve
      }))

      const hydration = contentState._hydratePartitionChunk(6, 1, 2)
      expect(contentState.partitionHydrationPromise).not.toBeNull()

      contentState._scheduleUrgentPartitionHydration(6)

      expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)
      expect(contentState.urgentPartitionHydrationTask).not.toBeNull()

      resolveParse([])
      await hydration

      expect(contentState.partitionHydrationPromise).toBeNull()
      expect(contentState.partitionHydrationPendingUrgent).toBe(false)
      expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)
      expect(contentState.urgentPartitionHydrationTask).not.toBeNull()
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame
      window.cancelAnimationFrame = originalCancelAnimationFrame
    }
  })

  it('hydrates partition markdown through the async parser path', async () => {
    const ctx = createMuyaContext()
    const contentState = ctx.contentState
    const markdown = 'alpha\n\nbeta\n\ngamma\n\ndelta'
    contentState.canonicalMarkdown = markdown
    contentState.partitionVersion = 1
    contentState.partitionHydrationRunId = 2
    contentState.partitionMap = [
      createPartition(0, 0, 7),
      createPartition(1, 7, 13),
      createPartition(2, 13, 20),
      createPartition(3, 20, markdown.length)
    ]
    const placeholder = contentState._createPartitionPlaceholder(0, 0, contentState.partitionMap.length)
    contentState.blocks = [placeholder]
    contentState._linkRootBlocks()
    contentState._rebuildBlockMap()
    contentState._syncDocumentModels()
    contentState._selectPartitionHydrationTarget = vi.fn(() => ({
      block: placeholder,
      chunkStartIndex: 0,
      chunkEndIndex: contentState.partitionMap.length,
      chunkStartOffset: 0,
      chunkEndOffset: markdown.length,
      beforePlaceholder: null,
      afterPlaceholder: null,
      viewportDistance: 0
    }))
    contentState._renderPartitionReplacement = vi.fn()

    const result = await contentState._hydratePartitionChunk(4, 1, 2)

    expect(result.hasMorePlaceholders).toBe(false)
    expect(contentState.blocks.some(block => block.key === placeholder.key)).toBe(false)
    expect(contentState.blocks.map(block => block.type)).toEqual(['p', 'p', 'p', 'p'])
    expect(contentState._renderPartitionReplacement).toHaveBeenCalled()
  })

  it('prefers the cursor partition window instead of forcing a full parse', () => {
    const ctx = createMuyaContext()
    const contentState = ctx.contentState
    const markdown = Array.from({ length: 80 }, (_, i) => `line ${i}`).join('\n\n')

    const result = contentState.importPartitionedMarkdown(markdown, {
      initialPartitionCount: 8,
      targetLines: [80, 80]
    })

    expect(result.isPartitioned).to.equal(true)
    expect(result.parsedPartitionStartIndex).to.be.greaterThan(0)
    expect(result.parsedPartitionEndIndex).to.be.lessThan(contentState.partitionMap.length)

    const hasLine40 = blocks => blocks.some(block => {
      if (typeof block.text === 'string' && block.text.includes('line 40')) {
        return true
      }
      return Array.isArray(block.children) && hasLine40(block.children)
    })

    expect(hasLine40(contentState.blocks)).to.equal(true)
  })

  it('defers initial parsing for large markdown without a cursor target', () => {
    const ctx = createMuyaContext()
    const contentState = ctx.contentState
    const markdown = Array.from({ length: 80 }, (_, i) => `line ${i}`).join('\n\n')
    const markdownToState = vi.spyOn(contentState, 'markdownToState')

    const result = contentState.importPartitionedMarkdown(markdown, {
      initialPartitionCount: 8
    })

    expect(result.isPartitioned).to.equal(true)
    expect(result.isInitialParseDeferred).to.equal(true)
    expect(result.parsedPartitionCount).to.equal(0)
    expect(markdownToState).not.toHaveBeenCalled()
    expect(contentState.blocks).toHaveLength(2)
    expect(contentState.blocks[0].functionType).to.equal('deferredCursorAnchor')
    expect(contentState.blocks[1].functionType).to.equal('partitionPlaceholder')
    expect(contentState.blocks[1].partitionStartIndex).to.equal(0)
    expect(contentState.blocks[1].partitionEndIndex).to.equal(contentState.partitionMap.length)
  })
})
