const TRANSIENT_BLOCK_FIELDS = new Set([
  'renderState',
  'estimatedHeight',
  'measuredHeight'
])

const cloneAttrs = block => {
  const attrs = {}
  for (const key of Object.keys(block)) {
    if (
      key === 'key' ||
      key === 'type' ||
      key === 'parent' ||
      key === 'children' ||
      key === 'preSibling' ||
      key === 'nextSibling' ||
      key === 'text' ||
      TRANSIENT_BLOCK_FIELDS.has(key)
    ) {
      continue
    }
    attrs[key] = block[key]
  }
  return attrs
}

class DocumentModel {
  constructor () {
    this.blocks = new Map()
    this.rootIds = []
    this.version = 0
  }

  rebuildFromBlocks (rootBlocks) {
    this.blocks.clear()
    this.rootIds = []

    const visit = (block, index = 0) => {
      const id = block.key
      const childIds = Array.isArray(block.children)
        ? block.children.map(child => child.key)
        : []

      if (!block.parent) {
        this.rootIds.push(id)
      }

      this.blocks.set(id, {
        id,
        type: block.type,
        parentId: block.parent || null,
        childIds,
        prevId: block.preSibling || null,
        nextId: block.nextSibling || null,
        text: block.text || '',
        attrs: cloneAttrs(block),
        index,
        version: this.version + 1
      })

      if (Array.isArray(block.children)) {
        for (let i = 0; i < block.children.length; i++) {
          visit(block.children[i], i)
        }
      }
    }

    for (let i = 0; i < rootBlocks.length; i++) {
      visit(rootBlocks[i], i)
    }

    this.version++
    return this.version
  }

  getBlock (id) {
    return this.blocks.get(id) || null
  }

  getRootIds () {
    return this.rootIds.slice()
  }

  hasBlock (id) {
    return this.blocks.has(id)
  }
}

export default DocumentModel
