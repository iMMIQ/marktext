import { describe, expect, it, vi } from 'vitest'
import Muya from '../../../src/muya/lib'

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
})
