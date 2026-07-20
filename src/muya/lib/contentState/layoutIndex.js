const DEFAULT_BLOCK_HEIGHT = 24

class FenwickTree {
  constructor (size = 0) {
    this.reset(size)
  }

  reset (size) {
    this.size = size
    this.tree = new Array(size + 1).fill(0)
  }

  build (values) {
    this.reset(values.length)
    for (let i = 1; i <= values.length; i++) {
      this.tree[i] += values[i - 1]
      const parent = i + (i & -i)
      if (parent <= values.length) {
        this.tree[parent] += this.tree[i]
      }
    }
  }

  add (index, delta) {
    for (let i = index + 1; i <= this.size; i += i & -i) {
      this.tree[i] += delta
    }
  }

  sum (count) {
    let total = 0
    for (let i = Math.min(count, this.size); i > 0; i -= i & -i) {
      total += this.tree[i]
    }
    return total
  }

  lowerBound (target) {
    if (target <= 0) {
      return 0
    }

    let index = 0
    let bit = 1
    while (bit << 1 <= this.size) {
      bit <<= 1
    }

    for (let step = bit; step > 0; step >>= 1) {
      const next = index + step
      if (next <= this.size && this.tree[next] < target) {
        index = next
        target -= this.tree[next]
      }
    }

    return Math.min(index, Math.max(0, this.size - 1))
  }
}

class LayoutIndex {
  constructor () {
    this.nodes = []
    this.nodeMap = new Map()
    this.heightTree = new FenwickTree()
  }

  rebuild (rootBlocks, partitionMap = [], estimateOverrides = new Map()) {
    const previousNodes = this.nodeMap
    this.nodes = []
    this.nodeMap = new Map()
    const heights = []
    for (let index = 0; index < rootBlocks.length; index++) {
      const block = rootBlocks[index]
      const partition = partitionMap[Math.min(index, Math.max(0, partitionMap.length - 1))]
      const previousNode = previousNodes.get(block.key)
      const estimatedHeight = this._resolveEstimatedHeight(block, partition, previousNode, estimateOverrides)
      const measuredHeight = previousNode ? previousNode.measuredHeight : null
      const height = this._resolveHeight({ estimatedHeight, measuredHeight })
      const node = {
        blockId: block.key,
        index,
        estimatedHeight,
        measuredHeight,
        dirty: false
      }

      this.nodes.push(node)
      this.nodeMap.set(block.key, node)
      heights.push(height)
    }
    this.heightTree.build(heights)
  }

  _resolveEstimatedHeight (block, partition, previousNode, estimateOverrides) {
    const override = estimateOverrides.get(block.key)
    if (typeof override === 'number' && override > 0) {
      return override
    }
    if (previousNode && typeof previousNode.estimatedHeight === 'number') {
      return previousNode.estimatedHeight
    }
    if (typeof block.estimatedHeight === 'number' && block.estimatedHeight > 0) {
      return block.estimatedHeight
    }
    if (partition && typeof partition.estimatedHeight === 'number' && partition.estimatedHeight > 0) {
      return partition.estimatedHeight
    }
    return DEFAULT_BLOCK_HEIGHT
  }

  _resolveHeight (node) {
    if (typeof node.measuredHeight === 'number' && node.measuredHeight > 0) {
      return node.measuredHeight
    }
    if (typeof node.estimatedHeight === 'number' && node.estimatedHeight > 0) {
      return node.estimatedHeight
    }
    return DEFAULT_BLOCK_HEIGHT
  }

  getNode (blockId) {
    return this.nodeMap.get(blockId) || null
  }

  getHeight (blockId) {
    const node = this.getNode(blockId)
    return node ? this._resolveHeight(node) : DEFAULT_BLOCK_HEIGHT
  }

  getEstimatedHeight (blockId) {
    const node = this.getNode(blockId)
    return node ? node.estimatedHeight : DEFAULT_BLOCK_HEIGHT
  }

  updateMeasuredHeight (blockId, measuredHeight) {
    const node = this.getNode(blockId)
    if (!node || typeof measuredHeight !== 'number' || measuredHeight <= 0) {
      return
    }

    const previousHeight = this._resolveHeight(node)
    node.measuredHeight = measuredHeight
    node.dirty = false
    const nextHeight = this._resolveHeight(node)
    const delta = nextHeight - previousHeight
    if (delta !== 0) {
      this.heightTree.add(node.index, delta)
    }
  }

  setEstimatedHeight (blockId, estimatedHeight) {
    const node = this.getNode(blockId)
    if (!node || typeof estimatedHeight !== 'number' || estimatedHeight <= 0) {
      return
    }

    const previousHeight = this._resolveHeight(node)
    node.estimatedHeight = estimatedHeight
    const nextHeight = this._resolveHeight(node)
    const delta = nextHeight - previousHeight
    if (delta !== 0) {
      this.heightTree.add(node.index, delta)
    }
  }

  findIndexAtOffset (offset) {
    return this.heightTree.lowerBound(offset)
  }

  getTopForIndex (index) {
    return this.heightTree.sum(index)
  }

  getRangeForViewport (scrollTop, viewportHeight, buffer = viewportHeight) {
    if (!this.nodes.length) {
      return [0, 0]
    }

    const startBound = Math.max(0, scrollTop - buffer)
    const endBound = scrollTop + viewportHeight + buffer
    const startIndex = this.findIndexAtOffset(startBound)
    let endIndex = this.findIndexAtOffset(endBound) + 1

    if (endIndex < this.nodes.length) {
      endIndex = Math.min(this.nodes.length, endIndex + 1)
    }

    return [
      Math.max(0, startIndex),
      Math.min(this.nodes.length, endIndex)
    ]
  }
}

export default LayoutIndex
