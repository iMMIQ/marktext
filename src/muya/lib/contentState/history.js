import { deepCopy } from '../utils'
import { UNDO_DEPTH } from '../config'

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
      this.index = this.index - 1

      const state = deepCopy(this.stack[this.index])
      const { blocks, cursor, renderRange } = state
      cursor.noHistory = true
      this.contentState.blocks = blocks
      this.contentState._rebuildBlockMap()
      this.contentState.renderRange = renderRange
      this.contentState.cursor = cursor
      this.contentState.render()
    }
  }

  redo () {
    this.pending = null
    const { index, stack } = this
    const len = stack.length
    if (index < len - 1) {
      this.index = index + 1
      const state = deepCopy(stack[this.index])
      const { blocks, cursor, renderRange } = state
      cursor.noHistory = true
      this.contentState.blocks = blocks
      this.contentState._rebuildBlockMap()
      this.contentState.renderRange = renderRange
      this.contentState.cursor = cursor
      this.contentState.render()
    }
  }

  push (state) {
    this.pending = null
    this.stack.splice(this.index + 1)

    const prevState = this.index >= 0 ? this.stack[this.index] : null
    const copyState = prevState
      ? this._incrementalCopy(state, prevState)
      : deepCopy(state)

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
        newBlocks.push(deepCopy(rootBlock))
      } else {
        const prevBlock = prevKeyMap.get(rootBlock.key)
        if (prevBlock) {
          // Unchanged → share reference from previous snapshot
          newBlocks.push(prevBlock)
        } else {
          // New root block (not in previous snapshot) → deep copy
          newBlocks.push(deepCopy(rootBlock))
        }
      }
    }

    return {
      blocks: newBlocks,
      cursor: deepCopy(state.cursor),
      renderRange: state.renderRange ? state.renderRange.slice() : [null, null]
    }
  }
}

export default History
