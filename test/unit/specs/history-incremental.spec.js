/**
 * Incremental history (undo/redo) tests.
 *
 * Verifies that the History class correctly uses incremental copy:
 *   - Unchanged root blocks are shared (same reference) between snapshots
 *   - Dirty root blocks are deep-copied
 *   - Undo/redo still produces correct content
 *   - Edge cases: first push, clearHistory, setHistory fallback
 */

import { describe, expect, it, vi } from 'vitest'
import ContentState from '../../../src/muya/lib/contentState'
import EventCenter from '../../../src/muya/lib/eventHandler/event'
import ExportMarkdown from '../../../src/muya/lib/utils/exportMarkdown'
import { MUYA_DEFAULT_OPTION } from '../../../src/muya/lib/config'

vi.mock('../../../src/muya/lib/prism/index', () => ({
  default: {},
  search: () => [],
  loadLanguage: () => Promise.resolve([]),
  loadedLanguages: new Set(),
  transformAliasToOrigin: langs => langs
}))

const createCS = (markdown = '') => {
  const ctx = { options: { ...MUYA_DEFAULT_OPTION } }
  ctx.eventCenter = new EventCenter()
  ctx.contentState = new ContentState(ctx, ctx.options)
  if (markdown) {
    ctx.contentState.importMarkdown(markdown)
  }
  // Mock render to avoid DOM dependency
  ctx.contentState.render = vi.fn()
  return ctx.contentState
}

const exportMd = cs => {
  const blocks = cs.getBlocks()
  return new ExportMarkdown(blocks, cs.listIndentation, cs.isGitlabCompatibilityEnabled).generate()
}

/**
 * Push a history entry by simulating a cursor move to a different block.
 * This triggers the cursor setter's "cross-block" path, which calls history.push().
 */
function pushHistory (cs, cursorStartKey) {
  const key = cursorStartKey || cs.getLastBlock().key
  cs.cursor = {
    start: { key, offset: 0 },
    end: { key, offset: 0 }
  }
}

// ═══════════════════════════════════════════════════════════════
//  Tests
// ═══════════════════════════════════════════════════════════════

describe('History: incremental copy shares unchanged blocks', () => {
  it('first push does a full deep copy (no previous snapshot)', () => {
    const cs = createCS('hello')
    const root = cs.blocks[0]

    pushHistory(cs, root.children[0].key)
    expect(cs.history.stack.length).toBe(1)

    const snap = cs.history.stack[0]
    // Snapshot blocks should be different objects from live state
    expect(snap.blocks[0]).not.toBe(root)
    expect(snap.blocks[0].children[0].text).toBe('hello')
  })

  it('shares blocks that are neither previous nor current cursor root', () => {
    const cs = createCS('aaa\n\nbbb\n\nccc')
    const [rootA, rootB] = cs.blocks

    // First push: cursor in rootA
    pushHistory(cs, rootA.children[0].key)
    expect(cs.history.stack.length).toBe(1)

    // Modify rootB's text, then move cursor to rootB
    rootB.children[0].text = 'BBB'
    pushHistory(cs, rootB.children[0].key)
    expect(cs.history.stack.length).toBe(2)

    const snap0 = cs.history.stack[0]
    const snap1 = cs.history.stack[1]

    // rootA was the previous cursor → marked dirty (safety for text changes)
    // rootB is the current cursor → marked dirty (actually changed)
    // rootC is neither → should be SHARED (same reference in both snapshots)
    expect(snap1.blocks[2]).toBe(snap0.blocks[2]) // rootC shared

    // rootB was dirty → deep-copied with new text
    expect(snap1.blocks[1]).not.toBe(snap0.blocks[1])
    expect(snap1.blocks[1].children[0].text).toBe('BBB')

    // rootA was previous cursor → deep-copied (safety)
    expect(snap1.blocks[0]).not.toBe(snap0.blocks[0])
  })

  it('shares all non-dirty blocks for sequential same-block edits', () => {
    // With 5 paragraphs, edit only one repeatedly
    const cs = createCS('aaa\n\nbbb\n\nccc\n\nddd\n\neee')
    expect(cs.blocks.length).toBe(5)

    const rootB = cs.blocks[1]

    // Push initial state
    pushHistory(cs, rootB.children[0].key)

    // Edit rootB and push (same-block via cross-block: move cursor away then back)
    rootB.children[0].text = 'BBB1'
    pushHistory(cs, cs.blocks[0].children[0].key)

    rootB.children[0].text = 'BBB2'
    pushHistory(cs, cs.blocks[2].children[0].key)

    // Check that blocks 3 and 4 (index 3, 4) are shared across all snapshots
    const snaps = cs.history.stack
    for (let i = 1; i < snaps.length; i++) {
      // Blocks not near the cursor should be shared
      expect(snaps[i].blocks[3]).toBe(snaps[0].blocks[3])
      expect(snaps[i].blocks[4]).toBe(snaps[0].blocks[4])
    }
  })

  it('new root blocks (not in previous snapshot) are deep-copied', () => {
    const cs = createCS('aaa')
    const rootA = cs.blocks[0]

    pushHistory(cs, rootA.children[0].key)
    expect(cs.history.stack.length).toBe(1)

    // Insert a new root block
    const newBlock = cs.createBlockP('new')
    cs.insertAfter(newBlock, rootA)
    expect(cs.blocks.length).toBe(2)

    pushHistory(cs, newBlock.children[0].key)
    expect(cs.history.stack.length).toBe(2)

    const snap1 = cs.history.stack[1]
    // New block was not in previous snapshot, should be deep-copied
    expect(snap1.blocks[1]).not.toBe(newBlock)
    expect(snap1.blocks[1].children[0].text).toBe('new')
  })
})

describe('History: undo/redo with incremental copy', () => {
  it('undo restores correct state after incremental push', () => {
    const cs = createCS('aaa\n\nbbb')
    const [rootA, rootB] = cs.blocks

    // Push initial state
    pushHistory(cs, rootA.children[0].key)

    // Modify and push
    rootB.children[0].text = 'BBB'
    pushHistory(cs, rootB.children[0].key)

    // Modify again
    rootA.children[0].text = 'AAA'
    pushHistory(cs, rootA.children[0].key)

    expect(cs.history.stack.length).toBe(3)
    expect(cs.history.index).toBe(2)

    // Undo to state 1: rootA=original, rootB=BBB
    cs.history.undo()
    expect(cs.history.index).toBe(1)
    expect(cs.blocks[0].children[0].text).toBe('aaa')
    expect(cs.blocks[1].children[0].text).toBe('BBB')

    // Undo to state 0: rootA=original, rootB=original
    cs.history.undo()
    expect(cs.history.index).toBe(0)
    expect(cs.blocks[0].children[0].text).toBe('aaa')
    expect(cs.blocks[1].children[0].text).toBe('bbb')

    // Redo to state 1
    cs.history.redo()
    expect(cs.history.index).toBe(1)
    expect(cs.blocks[0].children[0].text).toBe('aaa')
    expect(cs.blocks[1].children[0].text).toBe('BBB')

    // Redo to state 2
    cs.history.redo()
    expect(cs.history.index).toBe(2)
    expect(cs.blocks[0].children[0].text).toBe('AAA')
    expect(cs.blocks[1].children[0].text).toBe('BBB')
  })

  it('undo after structural changes (insert/remove) restores correct state', () => {
    const cs = createCS('aaa\n\nbbb')
    const [rootA] = cs.blocks

    // Push initial
    pushHistory(cs, rootA.children[0].key)

    // Insert a new block between A and B
    const newBlock = cs.createBlockP('middle')
    cs.insertAfter(newBlock, rootA)
    pushHistory(cs, newBlock.children[0].key)

    expect(cs.blocks.length).toBe(3)
    expect(cs.history.index).toBe(1)

    // Undo: should go back to 2 blocks
    cs.history.undo()
    expect(cs.history.index).toBe(0)
    expect(cs.blocks.length).toBe(2)
    expect(cs.blocks[0].children[0].text).toBe('aaa')
    expect(cs.blocks[1].children[0].text).toBe('bbb')

    // Redo: should restore the inserted block
    cs.history.redo()
    expect(cs.history.index).toBe(1)
    expect(cs.blocks.length).toBe(3)
    expect(cs.blocks[1].children[0].text).toBe('middle')
  })

  it('undo/redo after removeBlock restores siblings correctly', () => {
    const cs = createCS('aaa\n\nbbb\n\nccc')
    const [rootA, rootB, rootC] = cs.blocks

    pushHistory(cs, rootA.children[0].key)

    // Remove middle block
    cs.removeBlock(rootB)
    pushHistory(cs, rootC.children[0].key)

    expect(cs.blocks.length).toBe(2)

    // Undo
    cs.history.undo()
    expect(cs.blocks.length).toBe(3)
    expect(exportMd(cs).trimEnd()).toBe('aaa\n\nbbb\n\nccc')
    expect(cs.getBlock(rootB.key)).toBe(cs.blocks[1])
    expect(cs.getBlock(rootB.children[0].key)).toBe(cs.blocks[1].children[0])

    // Redo
    cs.history.redo()
    expect(cs.blocks.length).toBe(2)
    expect(exportMd(cs).trimEnd()).toBe('aaa\n\nccc')
    expect(cs.getBlock(rootB.key)).toBe(null)
    expect(cs.getBlock(rootB.children[0].key)).toBe(null)
  })

  it('undo reuses unchanged live roots without mutating snapshots', () => {
    const cs = createCS('aaa\n\nbbb\n\nccc')
    const [rootA, rootB] = cs.blocks

    pushHistory(cs, rootA.children[0].key)

    rootB.children[0].text = 'BBB'
    pushHistory(cs, rootB.children[0].key)

    rootA.children[0].text = 'AAA'
    pushHistory(cs, rootA.children[0].key)

    const liveRootCBeforeUndo = cs.blocks[2]
    const targetSnapshot = cs.history.stack[1]

    cs.history.undo()

    expect(cs.blocks[0].children[0].text).toBe('aaa')
    expect(cs.blocks[1].children[0].text).toBe('BBB')
    expect(cs.blocks[2].children[0].text).toBe('ccc')
    expect(cs.blocks[2]).toBe(liveRootCBeforeUndo)
    expect(cs.blocks[2]).not.toBe(targetSnapshot.blocks[2])

    cs.blocks[2].children[0].text = 'CCC'
    expect(targetSnapshot.blocks[2].children[0].text).toBe('ccc')
    expect(cs.history.stack[2].blocks[2].children[0].text).toBe('ccc')
  })
})

describe('History: dirty tracking via mutation methods', () => {
  it('removeBlock marks adjacent roots dirty', () => {
    const cs = createCS('aaa\n\nbbb\n\nccc')
    const [rootA, rootB, rootC] = cs.blocks

    // Push initial
    pushHistory(cs, rootA.children[0].key)

    // Remove middle block - should mark A and C as dirty (sibling pointers)
    cs.removeBlock(rootB)

    pushHistory(cs, rootC.children[0].key)
    const snap0 = cs.history.stack[0]
    const snap1 = cs.history.stack[1]

    // After removing B, A and C's sibling pointers changed
    // Both should be deep-copied (not shared)
    expect(snap1.blocks[0]).not.toBe(snap0.blocks[0])
    expect(snap1.blocks[1]).not.toBe(snap0.blocks[2])
  })

  it('insertAfter marks target root dirty', () => {
    const cs = createCS('aaa\n\nbbb')
    const [rootA] = cs.blocks

    pushHistory(cs, rootA.children[0].key)

    const newBlock = cs.createBlockP('middle')
    cs.insertAfter(newBlock, rootA)

    pushHistory(cs, newBlock.children[0].key)
    const snap0 = cs.history.stack[0]
    const snap1 = cs.history.stack[1]

    // rootA had nextSibling change → dirty → deep-copied
    expect(snap1.blocks[0]).not.toBe(snap0.blocks[0])
  })

  it('replaceBlock marks root dirty', () => {
    const cs = createCS('old')
    const oldBlock = cs.blocks[0]

    pushHistory(cs, oldBlock.children[0].key)

    const newBlock = cs.createBlockP('new')
    cs.replaceBlock(newBlock, oldBlock)

    pushHistory(cs, newBlock.children[0].key)
    const snap1 = cs.history.stack[1]

    // Replaced block should be deep-copied
    expect(snap1.blocks[0].children[0].text).toBe('new')
    expect(snap1.blocks[0]).not.toBe(cs.history.stack[0].blocks[0])
  })
})

describe('History: clearHistory resets dirty set', () => {
  it('after clearHistory, next push does full copy', () => {
    const cs = createCS('aaa\n\nbbb')
    const [rootA, rootB] = cs.blocks

    pushHistory(cs, rootA.children[0].key)

    cs.history.clearHistory()

    // Push again: dirty set was cleared, so full copy
    pushHistory(cs, rootB.children[0].key)
    expect(cs.history.stack.length).toBe(1)

    // No previous snapshot to share with, so full copy
    const snap = cs.history.stack[0]
    expect(snap.blocks[0]).not.toBe(rootA)
    expect(snap.blocks[1]).not.toBe(rootB)
  })
})

describe('History: incremental copy preserves shared block integrity', () => {
  it('does not persist viewport render state in snapshots restored by undo', () => {
    const cs = createCS('aaa\n\nbbb\n\nccc')
    const [rootA, rootB, rootC] = cs.blocks

    rootA.renderState = 'rendered'
    rootB.renderState = 'rendered'
    rootC.renderState = 'placeholder'
    pushHistory(cs, rootA.children[0].key)

    rootA.renderState = 'placeholder'
    rootB.renderState = 'placeholder'
    rootC.renderState = 'rendered'
    rootB.children[0].text = 'BBB'
    pushHistory(cs, rootB.children[0].key)

    const snap0 = cs.history.stack[0]
    const snap1 = cs.history.stack[1]
    expect(snap0.blocks.every(block => block.renderState === undefined)).toBe(true)
    expect(snap1.blocks.every(block => block.renderState === undefined)).toBe(true)

    cs.history.undo()
    expect(cs.blocks.every(block => block.renderState === undefined)).toBe(true)
    expect(cs.blocks[0].children[0].text).toBe('aaa')
    expect(cs.blocks[1].children[0].text).toBe('bbb')
    expect(cs.blocks[2].children[0].text).toBe('ccc')
  })

  it('modifying live blocks after push does not affect snapshots', () => {
    const cs = createCS('aaa\n\nbbb\n\nccc')
    const [rootA, rootB, rootC] = cs.blocks

    pushHistory(cs, rootA.children[0].key)

    // Modify live block A
    rootA.children[0].text = 'CHANGED'

    // Push: rootA and rootB are dirty (prev + current cursor), rootC is shared
    pushHistory(cs, rootB.children[0].key)

    const snap0 = cs.history.stack[0]
    const snap1 = cs.history.stack[1]

    // snap0 should still have original text (immutable)
    expect(snap0.blocks[0].children[0].text).toBe('aaa')
    // snap1 should have the changed text
    expect(snap1.blocks[0].children[0].text).toBe('CHANGED')
    // rootC is shared between both snapshots
    expect(snap1.blocks[2]).toBe(snap0.blocks[2])
    expect(snap1.blocks[2].children[0].text).toBe('ccc')

    // Modify live rootC
    rootC.children[0].text = 'ALSO_CHANGED'

    // Shared snapshot blocks should still be 'ccc' (immutable)
    expect(snap0.blocks[2].children[0].text).toBe('ccc')
    expect(snap1.blocks[2].children[0].text).toBe('ccc')
  })

  it('splice (discard redo entries) does not corrupt shared blocks', () => {
    const cs = createCS('aaa\n\nbbb\n\nccc')
    const [rootA, rootB, rootC] = cs.blocks

    pushHistory(cs, rootA.children[0].key)
    rootB.children[0].text = 'BBB'
    pushHistory(cs, rootB.children[0].key)
    rootC.children[0].text = 'CCC'
    pushHistory(cs, rootC.children[0].key)

    // Undo twice
    cs.history.undo()
    cs.history.undo()
    expect(cs.history.index).toBe(0)

    // Undo replaces the live block tree, so re-read blocks before mutating.
    const liveRootA = cs.blocks[0]

    // Modify rootA, then move the cursor to a different root so history.push()
    // runs immediately and splices the redo branch.
    liveRootA.children[0].text = 'AAA'
    pushHistory(cs, cs.blocks[1].children[0].key)

    // The new snapshot at index 1 should be correct
    const snap1 = cs.history.stack[1]
    expect(snap1.blocks[0].children[0].text).toBe('AAA')
    // rootB text in snapshot: was 'BBB' at push time but live was modified during undo restore
    // After undo to index 0, rootB has original text. Then edit rootA and push.
    // The snapshot at index 1 captures rootB as it currently is (original 'bbb' since undo restored it)
    expect(snap1.blocks[1].children[0].text).toBe('bbb')
  })
})

describe('History: memory savings estimation', () => {
  it('shares most blocks for typical edits in a large document', () => {
    // Create a document with 10 paragraphs
    const paragraphs = []
    for (let i = 0; i < 10; i++) {
      paragraphs.push(`paragraph ${i}`)
    }
    const cs = createCS(paragraphs.join('\n\n'))
    expect(cs.blocks.length).toBe(10)

    // Push initial state
    pushHistory(cs, cs.blocks[0].children[0].key)

    // Simulate 5 edits, each modifying one block and moving cursor there
    // Each edit marks 2 roots dirty (prev + current cursor)
    for (let i = 1; i <= 5; i++) {
      cs.blocks[i].children[0].text = `modified ${i}`
      pushHistory(cs, cs.blocks[i].children[0].key)
    }

    expect(cs.history.stack.length).toBe(6)

    // Count shared blocks across consecutive snapshots
    let sharedCount = 0
    let totalBlocks = 0
    for (let i = 1; i < cs.history.stack.length; i++) {
      const prev = cs.history.stack[i - 1]
      const curr = cs.history.stack[i]
      for (let j = 0; j < curr.blocks.length; j++) {
        totalBlocks++
        if (curr.blocks[j] === prev.blocks[j]) {
          sharedCount++
        }
      }
    }

    // With 10 root blocks and each edit marking ~2 dirty, we expect
    // at least 60% sharing (blocks 5-9 and some others)
    const shareRatio = sharedCount / totalBlocks
    expect(shareRatio).toBeGreaterThan(0.5)
  })
})
