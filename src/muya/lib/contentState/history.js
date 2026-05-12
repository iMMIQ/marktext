import { deepCopy } from '../utils'
import { UNDO_DEPTH } from '../config'

const clearTransientRenderState = blocks => {
  for (const block of blocks) {
    delete block.renderState
    if (Array.isArray(block.children) && block.children.length) {
      clearTransientRenderState(block.children)
    }
  }
}

const copyHistoryRoot = block => {
  const copiedBlock = deepCopy(block)
  clearTransientRenderState([copiedBlock])
  return copiedBlock
}

class History {
  constructor (contentState) {
    this.stack = []
    this.index = -1
    this.contentState = contentState
    this.pending = null
    this._dirtyRootKeys = new Set()
  }

  // --- Dirty tracking ---

  /**
   * Mark a root-level block key as dirty so it will be deep-copied on the
   * next push instead of shared from the previous snapshot.
   */
  markRootDirty (rootKey) {
    this._dirtyRootKeys.add(rootKey)
  }

  // --- Core history operations ---

  undo () {
    this.commitPending()
    if (this.index > 0) {
      const currentIndex = this.index
      this.index = this.index - 1
      this._restore(this.stack[this.index], this.stack[currentIndex])
    }
  }

  redo () {
    this.pending = null
    const { index, stack } = this
    const len = stack.length
    if (index < len - 1) {
      const currentState = stack[index]
      this.index = index + 1
      this._restore(stack[this.index], currentState)
    }
  }

  push (state) {
    this.pending = null
    this.stack.splice(this.index + 1)

    const prevState = this.index >= 0 ? this.stack[this.index] : null
    const copyState = prevState
      ? this._incrementalCopy(state, prevState)
      : this._copySnapshot(state)

    this.stack.push(copyState)
    if (this.stack.length > UNDO_DEPTH) {
      this.stack.shift()
      this.index = this.index - 1
    }
    this.index = this.index + 1
    this._dirtyRootKeys.clear()
  }

  pushPending (state) {
    this.pending = state
  }

  commitPending () {
    if (this.pending) {
      this.push(this.pending)
    }
  }

  clearHistory () {
    this.stack = []
    this.index = -1
    this.pending = null
    this._dirtyRootKeys.clear()
  }

  // --- Incremental copy ---

  /**
   * Create a snapshot that shares unchanged root blocks with the previous
   * snapshot.  Only root blocks marked dirty (or absent from the previous
   * snapshot) are deep-copied.
   *
   * If the dirty set is empty (no mutations tracked), fall back to a full
   * deep copy for correctness.
   */
  _incrementalCopy (state, prevSnapshot) {
    const prevBlocks = prevSnapshot.blocks
    const hasDirty = this._dirtyRootKeys.size > 0

    // Fast lookup: previous snapshot root-key → block object
    const prevKeyMap = new Map()
    for (let i = 0; i < prevBlocks.length; i++) {
      prevKeyMap.set(prevBlocks[i].key, prevBlocks[i])
    }

    const newBlocks = []
    for (let i = 0; i < state.blocks.length; i++) {
      const rootBlock = state.blocks[i]

      if (!hasDirty || this._dirtyRootKeys.has(rootBlock.key)) {
        // Dirty or no tracking info → deep copy
        newBlocks.push(copyHistoryRoot(rootBlock))
      } else {
        const prevBlock = prevKeyMap.get(rootBlock.key)
        if (prevBlock) {
          // Unchanged → share reference from previous snapshot
          newBlocks.push(prevBlock)
        } else {
          // New root block (not in previous snapshot) → deep copy
          newBlocks.push(copyHistoryRoot(rootBlock))
        }
      }
    }

    return {
      blocks: newBlocks,
      cursor: deepCopy(state.cursor),
      renderRange: state.renderRange ? state.renderRange.slice() : [null, null]
    }
  }

  _copySnapshot (state) {
    return {
      blocks: state.blocks.map(copyHistoryRoot),
      cursor: deepCopy(state.cursor),
      renderRange: state.renderRange ? state.renderRange.slice() : [null, null]
    }
  }

  _restore (targetSnapshot, currentSnapshot) {
    const contentState = this.contentState
    const state = currentSnapshot
      ? this._materializeSnapshot(targetSnapshot, currentSnapshot, contentState.blocks)
      : deepCopy(targetSnapshot)
    const { blocks, cursor, renderRange } = state
    cursor.noHistory = true
    contentState.blocks = blocks
    if (state.removedRoots && state.addedRoots) {
      this._restoreBlockMap(state.removedRoots, state.addedRoots)
    } else {
      contentState._rebuildBlockMap()
    }
    contentState.renderRange = renderRange
    contentState.cursor = cursor
    contentState.render()
  }

  _materializeSnapshot (targetSnapshot, currentSnapshot, liveBlocks) {
    const currentKeyMap = new Map()
    for (let i = 0; i < currentSnapshot.blocks.length; i++) {
      const block = currentSnapshot.blocks[i]
      currentKeyMap.set(block.key, block)
    }

    const liveKeyMap = new Map()
    for (let i = 0; i < liveBlocks.length; i++) {
      const block = liveBlocks[i]
      liveKeyMap.set(block.key, block)
    }

    const newBlocks = []
    const addedRoots = []
    const targetRootKeys = new Set()
    const reusedRootKeys = new Set()
    for (let i = 0; i < targetSnapshot.blocks.length; i++) {
      const targetRoot = targetSnapshot.blocks[i]
      targetRootKeys.add(targetRoot.key)
      const currentRoot = currentKeyMap.get(targetRoot.key)
      const liveRoot = liveKeyMap.get(targetRoot.key)

      if (currentRoot && currentRoot === targetRoot && liveRoot) {
        clearTransientRenderState([liveRoot])
        newBlocks.push(liveRoot)
        reusedRootKeys.add(liveRoot.key)
      } else {
        const copiedRoot = copyHistoryRoot(targetRoot)
        newBlocks.push(copiedRoot)
        addedRoots.push(copiedRoot)
      }
    }

    const removedRoots = []
    for (let i = 0; i < liveBlocks.length; i++) {
      const liveRoot = liveBlocks[i]
      if (!targetRootKeys.has(liveRoot.key) || !reusedRootKeys.has(liveRoot.key)) {
        removedRoots.push(liveRoot)
      }
    }

    return {
      blocks: newBlocks,
      cursor: deepCopy(targetSnapshot.cursor),
      renderRange: targetSnapshot.renderRange ? targetSnapshot.renderRange.slice() : [null, null],
      removedRoots,
      addedRoots
    }
  }

  _restoreBlockMap (removedRoots, addedRoots) {
    for (let i = 0; i < removedRoots.length; i++) {
      this.contentState._removeFromBlockMap(removedRoots[i])
    }
    for (let i = 0; i < addedRoots.length; i++) {
      this.contentState._addToBlockMap(addedRoots[i])
    }
  }
}

export default History
