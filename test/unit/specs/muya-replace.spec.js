import { describe, expect, it, vi } from 'vitest'
import Muya from '../../../src/muya/lib'
import { MUYA_DEFAULT_OPTION } from '../../../src/muya/lib/config'

describe('Muya replace', () => {
  it('dispatches a document change after replacing search matches', () => {
    const searchMatches = { value: 'before', matches: [], index: -1 }
    const muya = Object.create(Muya.prototype)
    muya.contentState = {
      replace: vi.fn(),
      render: vi.fn(),
      searchMatches
    }
    muya.dispatchChange = vi.fn()

    const result = muya.replace('after', { isSingle: true })

    expect(muya.contentState.replace).toHaveBeenCalledWith('after', { isSingle: true })
    expect(muya.contentState.render).toHaveBeenCalledWith(false)
    expect(muya.dispatchChange).toHaveBeenCalledOnce()
    expect(result).toBe(searchMatches)
  })

  it('dispatches a range transaction without exporting a partitioned document', () => {
    const markdown = Array.from({ length: 12 }, (_, index) => `paragraph ${index}`).join('\n\n')
    const origin = document.createElement('div')
    document.body.appendChild(origin)
    const muya = new Muya(origin, { ...MUYA_DEFAULT_OPTION, markdown, initialRenderBlockCount: 3 })
    muya._cancelInitialDispatchTask()
    muya._cancelMetadataDispatchTask()
    muya._markPerformancePhase = vi.fn()
    muya._scheduleMetadataDispatchChange = vi.fn()
    muya.getMarkdown = vi.fn(() => {
      throw new Error('full export should not run')
    })
    const cs = muya.contentState
    cs.importMarkdown(markdown, {
      initialPartitionCount: 3,
      targetLines: [0]
    })
    const root = cs.blocks.find(block => block.functionType !== 'partitionPlaceholder')
    const leaf = cs.firstInDescendant(root)
    cs.cursor = {
      noHistory: true,
      start: { key: leaf.key, offset: leaf.text.length },
      end: { key: leaf.key, offset: leaf.text.length }
    }
    leaf.text += ' changed'
    let payload = null
    muya.eventCenter.subscribe('change', changes => {
      payload = changes
    })

    muya.dispatchChange()

    expect(muya.getMarkdown).not.toHaveBeenCalled()
    expect(payload.transaction).toHaveLength(1)
    expect(payload.revision).toBe(cs.documentStore.revision)
    expect(payload.wordCount).toBeNull()
    expect(payload.toc).toBeNull()
    expect(muya.markdown).toContain('paragraph 0 changed')
    expect(cs.documentStore.toString()).toBe(muya.markdown)
    expect(muya._scheduleMetadataDispatchChange).toHaveBeenCalledWith(muya.markdown)
    muya.contentState.clear()
    muya.eventCenter.detachAllDomEvents()
    muya.container.remove()
  })

  it('promotes the deferred cursor anchor on input without a full export', () => {
    const markdown = Array.from({ length: 12 }, (_, index) => `paragraph ${index}`).join('\n\n')
    const origin = document.createElement('div')
    document.body.appendChild(origin)
    const muya = new Muya(origin, { ...MUYA_DEFAULT_OPTION, markdown, initialRenderBlockCount: 3 })
    muya._cancelInitialDispatchTask()
    muya._cancelMetadataDispatchTask()
    muya._scheduleMetadataDispatchChange = vi.fn()
    muya.getMarkdown = vi.fn(() => {
      throw new Error('full export should not run')
    })
    const cs = muya.contentState
    const deferredRoot = cs.blocks.find(block => block.functionType === 'deferredCursorAnchor')
    const leaf = cs.firstInDescendant(deferredRoot)
    leaf.text = 'x'
    cs.cursor = {
      noHistory: true,
      start: { key: leaf.key, offset: 1 },
      end: { key: leaf.key, offset: 1 }
    }

    muya.dispatchChange()

    expect(muya.getMarkdown).not.toHaveBeenCalled()
    expect(deferredRoot.functionType).toBeUndefined()
    expect(muya.markdown.startsWith('x\n')).toBe(true)
    expect(cs.documentStore.toString()).toBe(muya.markdown)
    muya.contentState.clear()
    muya.eventCenter.detachAllDomEvents()
    muya.container.remove()
  })

  it('fully resets partitioned state when switching to a blank document', () => {
    const markdown = Array.from({ length: 12 }, (_, index) => `paragraph ${index}`).join('\n\n')
    const origin = document.createElement('div')
    document.body.appendChild(origin)
    const muya = new Muya(origin, { ...MUYA_DEFAULT_OPTION, markdown, initialRenderBlockCount: 3 })

    expect(muya.contentState.blocks.some(block => block.functionType === 'partitionPlaceholder')).toBe(true)

    muya.setMarkdown('')
    muya._cancelInitialDispatchTask()
    muya._cancelMetadataDispatchTask()

    const cs = muya.contentState
    expect(cs.documentStore.length).toBe(0)
    expect(cs.partitionMap).toHaveLength(0)
    expect(cs.blocks).toHaveLength(1)
    expect(cs.blocks[0].functionType).not.toBe('partitionPlaceholder')
    expect(cs.getIncrementalEditRange()).toBeNull()
    expect(muya.markdown).toBe('')
    expect(cs.documentStore.toString()).toBe('')
    expect(() => muya.dispatchChange()).not.toThrow()
    expect(cs.documentStore.toString()).toBe(muya.markdown)
    muya.contentState.clear()
    muya.eventCenter.detachAllDomEvents()
    muya.container.remove()
  })
})
