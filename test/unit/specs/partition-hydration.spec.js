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
    contentState._schedulePartitionHydration = vi.fn()

    contentState.refreshViewport(false)

    expect(contentState.stateRender.render).not.toHaveBeenCalled()
    expect(contentState._measureRenderedRootBlocks).toHaveBeenCalled()
    expect(contentState._schedulePartitionHydration).toHaveBeenCalledWith(24, true)
  })
})
