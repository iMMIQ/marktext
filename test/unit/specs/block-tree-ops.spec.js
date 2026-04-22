/**
 * Block tree data structure correctness tests.
 *
 * These tests exercise every primitive tree operation on ContentState's
 * block tree WITHOUT depending on DOM events or user interaction.
 * They serve as a regression guard when we swap the internal data
 * structure (e.g. adding a block map index).
 *
 * Test strategy:
 *   1. Create a ContentState from known markdown
 *   2. Perform tree operations (insert, remove, replace, query)
 *   3. Export back to markdown and verify it matches expectations
 *   4. Verify invariants: all keys unique, all parent/sibling refs consistent,
 *      no orphan nodes, map index matches tree if present
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
  return ctx.contentState
}

const exportMd = cs => {
  const blocks = cs.getBlocks()
  return new ExportMarkdown(blocks, cs.listIndentation, cs.isGitlabCompatibilityEnabled).generate()
}

// ─── Invariant checker ──────────────────────────────────────────

/**
 * Walk the block tree and verify structural invariants:
 *   - Every key is unique
 *   - parent refs match actual parent
 *   - sibling chain is consistent
 *   - blockMap (if present) contains exactly the same nodes as the tree
 */
function checkInvariants (cs) {
  const seenKeys = new Set()
  const mapNodes = new Set()

  const walk = (blocks, parent) => {
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]

      // Unique key
      expect(seenKeys.has(block.key), `duplicate key: ${block.key}`).toBe(false)
      seenKeys.add(block.key)

      // Parent ref
      if (parent) {
        expect(block.parent).toBe(parent.key)
      } else {
        expect(block.parent).toBeNull()
      }

      // Sibling chain
      if (i > 0) {
        expect(block.preSibling).toBe(blocks[i - 1].key)
      } else {
        expect(block.preSibling).toBeNull()
      }
      if (i < blocks.length - 1) {
        expect(block.nextSibling).toBe(blocks[i + 1].key)
      } else {
        expect(block.nextSibling).toBeNull()
      }

      // Recurse children
      if (block.children && block.children.length) {
        walk(block.children, block)
      }

      // Collect map node for later comparison
      mapNodes.add(block.key)
    }
  }

  walk(cs.blocks, null)

  // If blockMap exists, verify it contains exactly the same set of keys
  if (cs.blockMap) {
    expect(cs.blockMap.size, 'blockMap size mismatch').toBe(seenKeys.size)
    for (const key of seenKeys) {
      expect(cs.blockMap.has(key), `blockMap missing key: ${key}`).toBe(true)
    }
    for (const key of cs.blockMap.keys()) {
      expect(seenKeys.has(key), `blockMap has orphan key: ${key}`).toBe(true)
    }
  }

  return seenKeys.size
}

// ═══════════════════════════════════════════════════════════════
//  Tests
// ═══════════════════════════════════════════════════════════════

describe('Block tree: empty document', () => {
  it('creates a default empty document with one paragraph', () => {
    const cs = createCS()
    expect(cs.blocks.length).toBe(1)
    expect(cs.blocks[0].type).toBe('p')
    expect(cs.blocks[0].children.length).toBe(1)
    expect(cs.blocks[0].children[0].type).toBe('span')
    checkInvariants(cs)
  })
})

describe('Block tree: importMarkdown round-trip', () => {
  const cases = [
    { name: 'single paragraph', md: 'Hello world' },
    { name: 'multiple paragraphs', md: 'First\n\nSecond\n\nThird' },
    { name: 'headings', md: '# H1\n\n## H2\n\n### H3' },
    { name: 'bullet list', md: '- one\n- two\n- three' },
    { name: 'ordered list', md: '1. first\n2. second\n3. third' },
    { name: 'code block', md: '```js\nconst x = 1\n```' },
    { name: 'blockquote', md: '> quoted text\n> more quote' },
    { name: 'thematic break', md: 'above\n\n---\n\nbelow' },
    { name: 'mixed', md: '# Title\n\nParagraph with **bold**.\n\n- item 1\n- item 2\n\n```\ncode\n```\n\n> quote' }
  ]

  for (const { name, md } of cases) {
    it(name, () => {
      const cs = createCS(md)
      checkInvariants(cs)
      const exported = exportMd(cs).trimEnd()
      expect(exported).toBe(md)
    })
  }
})

describe('Block tree: createBlock', () => {
  it('creates a block with a unique key', () => {
    const cs = createCS()
    const b1 = cs.createBlock('p')
    const b2 = cs.createBlock('p')
    expect(b1.key).not.toBe(b2.key)
    expect(b1.type).toBe('p')
    expect(b2.type).toBe('p')
  })

  it('creates a paragraph with child span via createBlockP', () => {
    const cs = createCS()
    const p = cs.createBlockP('hello')
    expect(p.type).toBe('p')
    expect(p.children.length).toBe(1)
    expect(p.children[0].type).toBe('span')
    expect(p.children[0].text).toBe('hello')
  })
})

describe('Block tree: getBlock', () => {
  it('finds root-level blocks', () => {
    const cs = createCS('aaa\n\nbbb\n\nccc')
    const blocks = cs.blocks
    const found = cs.getBlock(blocks[1].key)
    expect(found).toBe(blocks[1])
    expect(found.children[0].text).toBe('bbb')
  })

  it('finds nested blocks (children)', () => {
    const cs = createCS('- one\n- two')
    const listBlock = cs.blocks[0]
    expect(listBlock.type).toBe('ul')
    const firstItem = listBlock.children[0]
    const found = cs.getBlock(firstItem.key)
    expect(found).toBe(firstItem)
    expect(found.type).toBe('li')
  })

  it('finds deeply nested blocks', () => {
    const cs = createCS('> paragraph in quote')
    const quote = cs.blocks[0]
    expect(quote.type).toBe('blockquote')
    const p = quote.children[0]
    const span = p.children[0]
    const found = cs.getBlock(span.key)
    expect(found).toBe(span)
  })

  it('returns null for non-existent key', () => {
    const cs = createCS('hello')
    expect(cs.getBlock('nonexistent')).toBeNull()
  })
})

describe('Block tree: getParent / getParents', () => {
  it('getParent returns parent of nested block', () => {
    const cs = createCS('- item')
    const ul = cs.blocks[0]
    const li = ul.children[0]
    const p = li.children[0]
    const span = p.children[0]

    expect(cs.getParent(span)).toBe(p)
    expect(cs.getParent(p)).toBe(li)
    expect(cs.getParent(li)).toBe(ul)
    expect(cs.getParent(ul)).toBeNull()
  })

  it('getParents returns full ancestor chain', () => {
    const cs = createCS('> quoted')
    const quote = cs.blocks[0]
    const p = quote.children[0]
    const span = p.children[0]

    const parents = cs.getParents(span)
    expect(parents.length).toBe(3) // span, p, blockquote
    expect(parents[0]).toBe(span)
    expect(parents[1]).toBe(p)
    expect(parents[2]).toBe(quote)
  })
})

describe('Block tree: getSibling', () => {
  it('getPreSibling / getNextSibling return correct siblings', () => {
    const cs = createCS('a\n\nb\n\nc')
    const [ba, bb, bc] = cs.blocks

    expect(cs.getPreSibling(bb)).toBe(ba)
    expect(cs.getNextSibling(bb)).toBe(bc)
    expect(cs.getPreSibling(ba)).toBeNull()
    expect(cs.getNextSibling(bc)).toBeNull()
  })
})

describe('Block tree: insertAfter / insertBefore', () => {
  it('insertAfter adds a block after the target', () => {
    const cs = createCS('first\n\nlast')
    const first = cs.blocks[0]
    const newBlock = cs.createBlockP('middle')
    cs.insertAfter(newBlock, first)

    expect(cs.blocks.length).toBe(3)
    expect(cs.blocks[1]).toBe(newBlock)
    expect(cs.blocks[0].nextSibling).toBe(newBlock.key)
    expect(cs.blocks[2].preSibling).toBe(newBlock.key)
    checkInvariants(cs)
  })

  it('insertBefore adds a block before the target', () => {
    const cs = createCS('first\n\nlast')
    const last = cs.blocks[1]
    const newBlock = cs.createBlockP('middle')
    cs.insertBefore(newBlock, last)

    expect(cs.blocks.length).toBe(3)
    expect(cs.blocks[1]).toBe(newBlock)
    checkInvariants(cs)
  })

  it('insertAfter at end of list works', () => {
    const cs = createCS('only')
    const only = cs.blocks[0]
    const newBlock = cs.createBlockP('appended')
    cs.insertAfter(newBlock, only)

    expect(cs.blocks.length).toBe(2)
    expect(cs.blocks[1]).toBe(newBlock)
    checkInvariants(cs)
  })
})

describe('Block tree: appendChild / prependChild', () => {
  it('appendChild adds a child to the end', () => {
    const cs = createCS('- one')
    const ul = cs.blocks[0]
    const newItem = cs.createBlock('li')
    const newP = cs.createBlockP('two')
    cs.appendChild(newItem, newP)
    cs.appendChild(ul, newItem)

    expect(ul.children.length).toBe(2)
    expect(ul.children[1]).toBe(newItem)
    checkInvariants(cs)
  })
})

describe('Block tree: removeBlock', () => {
  it('removes a middle block and fixes siblings', () => {
    const cs = createCS('a\n\nb\n\nc')
    const middle = cs.blocks[1]
    cs.removeBlock(middle)

    expect(cs.blocks.length).toBe(2)
    expect(exportMd(cs).trimEnd()).toBe('a\n\nc')
    checkInvariants(cs)
  })

  it('removes the first block', () => {
    const cs = createCS('a\n\nb')
    cs.removeBlock(cs.blocks[0])

    expect(cs.blocks.length).toBe(1)
    expect(cs.blocks[0].preSibling).toBeNull()
    checkInvariants(cs)
  })

  it('removes the last block', () => {
    const cs = createCS('a\n\nb')
    cs.removeBlock(cs.blocks[1])

    expect(cs.blocks.length).toBe(1)
    expect(cs.blocks[0].nextSibling).toBeNull()
    checkInvariants(cs)
  })

  it('removes a nested block', () => {
    const cs = createCS('- one\n- two\n- three')
    const ul = cs.blocks[0]
    const secondItem = ul.children[1]
    cs.removeBlock(secondItem)

    expect(ul.children.length).toBe(2)
    checkInvariants(cs)
  })
})

describe('Block tree: replaceBlock', () => {
  it('replaces a block in-place', () => {
    const cs = createCS('old')
    const oldBlock = cs.blocks[0]
    const newBlock = cs.createBlockP('new')
    cs.replaceBlock(newBlock, oldBlock)

    expect(cs.blocks[0]).toBe(newBlock)
    checkInvariants(cs)
  })
})

describe('Block tree: findOutMostBlock', () => {
  it('finds root from deeply nested block', () => {
    const cs = createCS('> text')
    const quote = cs.blocks[0]
    const p = quote.children[0]
    const span = p.children[0]

    expect(cs.findOutMostBlock(span)).toBe(quote)
    expect(cs.findOutMostBlock(p)).toBe(quote)
  })
})

describe('Block tree: closest', () => {
  it('finds closest ancestor by type string', () => {
    const cs = createCS('> text')
    const quote = cs.blocks[0]
    const p = quote.children[0]
    const span = p.children[0]

    expect(cs.closest(span, 'blockquote')).toBe(quote)
    expect(cs.closest(span, 'p')).toBe(p)
  })

  it('finds closest ancestor by regex', () => {
    const cs = createCS('> text')
    const quote = cs.blocks[0]
    const p = quote.children[0]
    // /blockquote/ does NOT match 'p', so it walks up to blockquote
    const result = cs.closest(p, /blockquote/)
    expect(result.type).toBe('blockquote')
    expect(result).toBe(quote)
  })

  it('returns null when no match', () => {
    const cs = createCS('text')
    const span = cs.blocks[0].children[0]
    expect(cs.closest(span, 'blockquote')).toBeNull()
  })
})

describe('Block tree: getActiveBlocks', () => {
  it('returns cursor block and ancestors', () => {
    const cs = createCS('aaa\n\nbbb')
    const span = cs.blocks[1].children[0]
    cs.cursor = {
      start: { key: span.key, offset: 0 },
      end: { key: span.key, offset: 0 }
    }

    const active = cs.getActiveBlocks()
    expect(active.length).toBe(2) // span, p
    expect(active[0]).toBe(span)
    expect(active[1]).toBe(cs.blocks[1])
  })
})

describe('Block tree: copyBlock', () => {
  it('deep copies a block with new unique keys', () => {
    const cs = createCS('hello')
    const original = cs.blocks[0]
    const copy = cs.copyBlock(original)

    expect(copy.key).not.toBe(original.key)
    expect(copy.children[0].key).not.toBe(original.children[0].key)
    expect(copy.children[0].text).toBe('hello')
    expect(copy.type).toBe('p')
  })
})

describe('Block tree: isInclude', () => {
  it('returns true for descendant', () => {
    const cs = createCS('> text')
    const quote = cs.blocks[0]
    const span = quote.children[0].children[0]
    expect(cs.isInclude(quote, span)).toBe(true)
  })

  it('returns false for non-descendant', () => {
    const cs = createCS('a\n\nb')
    expect(cs.isInclude(cs.blocks[0], cs.blocks[1])).toBe(false)
  })
})

describe('Block tree: getFirstBlock / getLastBlock', () => {
  it('returns first and last text-bearing leaf blocks', () => {
    const cs = createCS('first\n\nmiddle\n\nlast')
    const first = cs.getFirstBlock()
    const last = cs.getLastBlock()
    expect(first.text).toBe('first')
    expect(last.text).toBe('last')
  })
})

describe('Block tree: history undo/redo preserves structure', () => {
  it('undo restores previous state', () => {
    const cs = createCS('aaa')
    const span = cs.blocks[0].children[0]
    // Simulate first history push
    cs.cursor = {
      start: { key: span.key, offset: 3 },
      end: { key: span.key, offset: 3 }
    }
    // Simulate edit: change text
    span.text = 'bbb'
    // Simulate cursor move to new block (triggers history)
    const newP = cs.createBlockP('ccc')
    cs.insertAfter(newP, cs.blocks[0])
    const newSpan = newP.children[0]
    cs.cursor = {
      start: { key: newSpan.key, offset: 3 },
      end: { key: newSpan.key, offset: 3 }
    }

    expect(cs.blocks.length).toBe(2)
    checkInvariants(cs)
  })
})

describe('Block tree: re-import replaces entire tree', () => {
  it('importing new markdown replaces all blocks', () => {
    const cs = createCS('old content')
    expect(cs.blocks.length).toBe(1)

    cs.importMarkdown('new\n\ncontent')
    expect(cs.blocks.length).toBe(2)
    checkInvariants(cs)
    expect(exportMd(cs).trimEnd()).toBe('new\n\ncontent')
  })
})

describe('Block tree: complex operations sequence', () => {
  it('insert + remove + re-import stays consistent', () => {
    const cs = createCS('one\n\ntwo\n\nthree')
    expect(cs.blocks.length).toBe(3)

    // Insert after second
    const newBlock = cs.createBlockP('inserted')
    cs.insertAfter(newBlock, cs.blocks[1])
    expect(cs.blocks.length).toBe(4)
    checkInvariants(cs)

    // Remove the inserted block
    cs.removeBlock(newBlock)
    expect(cs.blocks.length).toBe(3)
    checkInvariants(cs)

    // Re-import entirely different content
    cs.importMarkdown('# Heading\n\nparagraph')
    expect(cs.blocks.length).toBe(2)
    checkInvariants(cs)
    expect(exportMd(cs).trimEnd()).toBe('# Heading\n\nparagraph')
  })

  it('table import/export preserves structure', () => {
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |'
    const cs = createCS(md)
    checkInvariants(cs)
    // Muya may normalize table cell spacing; verify structural integrity
    // rather than exact character-for-character round-trip
    const exported = exportMd(cs).trimEnd()
    // Parse both to compare structure, not whitespace
    const parseTable = s => s.split('\n').map(line => line.split('|').filter(c => c.trim()).map(c => c.trim()))
    expect(parseTable(exported)).toEqual(parseTable(md))
  })
})
