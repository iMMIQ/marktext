import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import bus from '@/bus'

vi.mock('@/services/runtime', () => ({
  getPlatform: () => 'linux',
  getRuntime: () => ({ env: { windowId: 1 } })
}))
vi.mock('@/services/nativeApi/app', () => ({
  default: {
    notifyWindowTabClosed: vi.fn(),
    updateLineEndingMenu: vi.fn()
  }
}))

const { useEditorStore } = await import('@/stores/editor')

const markdownDocument = (pathname, markdown) => ({
  filename: pathname.split('/').pop(),
  pathname,
  markdown,
  encoding: { encoding: 'utf8', isBom: false },
  lineEnding: 'lf',
  adjustLineEndingOnSave: false,
  trimTrailingNewline: 3,
  isMixedLineEndings: false
})

describe('editor tab lifecycle', () => {
  let store
  let loaded
  let changed
  const onLoaded = payload => loaded.push(payload)
  const onChanged = payload => changed.push(payload)

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useEditorStore()
    loaded = []
    changed = []
    bus.$off('file-loaded', onLoaded)
    bus.$off('file-changed', onChanged)
    bus.$on('file-loaded', onLoaded)
    bus.$on('file-changed', onChanged)
  })

  it('loads each newly selected document exactly once', () => {
    store.NEW_UNTITLED_TAB({ markdown: 'draft', selected: true })

    expect(loaded).toHaveLength(1)
    expect(changed).toHaveLength(0)
    expect(loaded[0]).toMatchObject({ id: store.currentFile.id, markdown: 'draft' })

    store.NEW_TAB_WITH_CONTENT({
      markdownDocument: markdownDocument('/tmp/second.md', 'second'),
      selected: true
    })

    expect(loaded).toHaveLength(2)
    expect(changed).toHaveLength(0)
    expect(loaded[1]).toMatchObject({ id: store.currentFile.id, markdown: 'second' })
  })

  it('uses file-changed only when activating an existing tab', () => {
    store.NEW_TAB_WITH_CONTENT({
      markdownDocument: markdownDocument('/tmp/first.md', 'first'),
      selected: true
    })
    const first = store.currentFile
    store.NEW_TAB_WITH_CONTENT({
      markdownDocument: markdownDocument('/tmp/second.md', 'second'),
      selected: true
    })
    changed.length = 0

    store.UPDATE_CURRENT_FILE(first)

    expect(changed).toEqual([expect.objectContaining({ id: first.id, markdown: 'first' })])
  })

  it('ignores stale close requests without removing another tab', () => {
    store.NEW_UNTITLED_TAB({ markdown: 'first', selected: true })
    store.NEW_UNTITLED_TAB({ markdown: 'second', selected: true })
    const tabIds = store.tabs.map(tab => tab.id)

    expect(() => store.CLOSE_TABS(['missing-tab'])).not.toThrow()
    store.REMOVE_FILE_WITHIN_TABS({ id: 'detached-tab' })

    expect(store.tabs.map(tab => tab.id)).toEqual(tabIds)
  })

  it('applies delayed changes only to the document that emitted them', () => {
    store.NEW_TAB_WITH_CONTENT({
      markdownDocument: markdownDocument('/tmp/first.md', 'first'),
      selected: true
    })
    const first = store.currentFile
    store.NEW_TAB_WITH_CONTENT({
      markdownDocument: markdownDocument('/tmp/second.md', 'second'),
      selected: true
    })
    const second = store.currentFile

    store.LISTEN_FOR_CONTENT_CHANGE({ id: first.id, markdown: 'first delayed' })
    store.LISTEN_FOR_CONTENT_CHANGE({ id: 'unknown-document', markdown: 'wrong document' })

    expect(first.markdown).toBe('first delayed')
    expect(second.markdown).toBe('second')
    expect(store.currentFile.id).toBe(second.id)
  })
})
