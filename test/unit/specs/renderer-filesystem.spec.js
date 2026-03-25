import { afterEach, describe, expect, it, vi } from 'vitest'
import nativeApi from '@/services/nativeApi'

describe('renderer filesystem and search facades', () => {
  afterEach(() => {
    delete window.mtNative
  })

  it('proxies operations through preload instead of Node builtins', async () => {
    const create = vi.fn(() => Promise.resolve())
    const searchText = vi.fn(() => Promise.resolve([
      { filePath: '/tmp/demo.md', matches: [] }
    ]))

    window.mtNative = {
      filesystem: {
        create
      },
      search: {
        searchText
      }
    }

    await nativeApi.filesystem.create('/tmp/demo', 'directory')
    const matches = await nativeApi.search.searchText(['/tmp'], 'demo', {
      isRegexp: false,
      isCaseSensitive: false
    })

    expect(create).toHaveBeenCalledWith('/tmp/demo', 'directory')
    expect(matches).toHaveLength(1)
  })
})
