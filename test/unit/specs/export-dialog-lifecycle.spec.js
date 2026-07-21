import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import bus from '@/bus'

const mocks = vi.hoisted(() => ({
  handlers: new Map()
}))

vi.mock('@/services/nativeApi/events', () => ({
  default: {
    on: vi.fn((name, handler) => mocks.handlers.set(name, handler))
  }
}))

const { useListenForMainStore } = await import('@/stores/listenForMain')

describe('export dialog lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.handlers.clear()
  })

  it('retains an export request until the async dialog consumes it', () => {
    const store = useListenForMainStore()
    store.bindShowDialogEvents()

    mocks.handlers.get('mt::show-export-dialog')(null, 'pdf')

    expect(store.pendingExportDialogType).toBe('pdf')
    expect(store.consumeExportDialogRequest()).toBe('pdf')
    expect(store.pendingExportDialogType).toBeNull()
  })

  it('clears a request delivered to an already-mounted dialog', () => {
    const store = useListenForMainStore()
    const showDialog = type => store.acknowledgeExportDialogRequest(type)
    bus.$on('showExportDialog', showDialog)

    store.requestExportDialog('styledHtml')

    expect(store.pendingExportDialogType).toBeNull()
    bus.$off('showExportDialog', showDialog)
  })
})
