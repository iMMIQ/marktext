import { describe, expect, it } from 'vitest'
import DocumentStore, { mapOffsetThroughSteps } from '../../../src/muya/lib/contentState/documentStore'

describe('DocumentStore', () => {
  it('stores and slices chunked text without flattening unrelated ranges', () => {
    const text = 'alpha\n' + 'x'.repeat(5000) + '\nomega'
    const store = new DocumentStore(text, { chunkSize: 1024 })

    expect(store.length).toBe(text.length)
    expect(store.lineCount).toBe(3)
    expect(store.slice(0, 5)).toBe('alpha')
    expect(store.slice(text.length - 5)).toBe('omega')
    expect(store.toString()).toBe(text)
  })

  it('applies ordered replace steps atomically and creates a working inverse', () => {
    const store = new DocumentStore('alpha beta gamma')
    const applied = store.apply({
      baseRevision: 0,
      origin: 'command',
      steps: [
        { from: 0, to: 5, insert: 'A' },
        { from: 11, to: 16, insert: 'G' }
      ]
    })

    expect(store.toString()).toBe('A beta G')
    expect(store.revision).toBe(1)

    store.apply(applied.inverse)

    expect(store.toString()).toBe('alpha beta gamma')
    expect(store.revision).toBe(2)
  })

  it('maps anchor affinity through insertions and deletions', () => {
    const store = new DocumentStore('abcd')
    const left = store.createAnchor(2, 'left')
    const right = store.createAnchor(2, 'right')
    const after = store.createAnchor(4, 'right')

    store.replace(2, 2, 'XY')

    expect(store.resolveAnchor(left)).toBe(2)
    expect(store.resolveAnchor(right)).toBe(4)
    expect(store.resolveAnchor(after)).toBe(6)

    store.replace(1, 5, '')

    expect(store.resolveAnchor(left)).toBe(1)
    expect(store.resolveAnchor(right)).toBe(1)
    expect(store.resolveAnchor(after)).toBe(2)
  })

  it('maps persistent offsets with the same transaction semantics as anchors', () => {
    const steps = [
      { from: 1, to: 1, insert: 'XY' },
      { from: 3, to: 5, insert: 'Z' }
    ]

    expect(mapOffsetThroughSteps(1, 'left', steps)).toBe(1)
    expect(mapOffsetThroughSteps(1, 'right', steps)).toBe(3)
    expect(mapOffsetThroughSteps(3, 'left', steps)).toBe(5)
    expect(mapOffsetThroughSteps(5, 'right', steps)).toBe(6)
  })

  it('keeps snapshots immutable across later transactions', () => {
    const store = new DocumentStore('before')
    const snapshot = store.snapshot()

    store.replace(0, store.length, 'after')

    expect(snapshot.toString()).toBe('before')
    expect(snapshot.revision).toBe(0)
    expect(store.toString()).toBe('after')
  })

  it('synchronizes a legacy full export as one minimal transaction', () => {
    const store = new DocumentStore('prefix beta suffix')
    const applied = store.syncText('prefix beta suffix', 'prefix better suffix')

    expect(applied.steps).toEqual([{ from: 10, to: 11, insert: 'ter' }])
    expect(store.toString()).toBe('prefix better suffix')
  })

  it('rejects stale revisions, overlap, and foreign anchors', () => {
    const store = new DocumentStore('abc')
    const other = new DocumentStore('abc')
    const foreignAnchor = other.createAnchor(1)

    expect(() => store.resolveAnchor(foreignAnchor)).toThrow(/does not belong/)
    expect(() => store.apply({
      baseRevision: 1,
      steps: [{ from: 0, to: 0, insert: 'x' }]
    })).toThrow(/Stale edit transaction/)
    expect(() => store.apply({
      baseRevision: 0,
      steps: [
        { from: 0, to: 2, insert: '' },
        { from: 1, to: 3, insert: '' }
      ]
    })).toThrow(/must not overlap/)
  })

  it('matches a flat string oracle across deterministic edits', () => {
    const store = new DocumentStore('0123456789', { chunkSize: 1024 })
    let oracle = '0123456789'
    let seed = 0x12345678

    const random = max => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed % max
    }

    for (let i = 0; i < 500; i++) {
      const from = random(oracle.length + 1)
      const to = from + random(oracle.length - from + 1)
      const insert = String.fromCharCode(97 + random(26)).repeat(random(8))
      store.replace(from, to, insert)
      oracle = oracle.slice(0, from) + insert + oracle.slice(to)

      expect(store.length).toBe(oracle.length)
      expect(store.toString()).toBe(oracle)
      if (oracle.length) {
        const sliceFrom = random(oracle.length)
        const sliceTo = sliceFrom + random(oracle.length - sliceFrom + 1)
        expect(store.slice(sliceFrom, sliceTo)).toBe(oracle.slice(sliceFrom, sliceTo))
      }
    }
  })
})
