import { HAS_TEXT_BLOCK_REG, DEFAULT_TURNDOWN_CONFIG } from '../config'
import { getUniqueId, deepCopy } from '../utils'
import selection from '../selection'
import StateRender from '../parser/render'
import enterCtrl from './enterCtrl'
import updateCtrl from './updateCtrl'
import backspaceCtrl from './backspaceCtrl'
import deleteCtrl from './deleteCtrl'
import codeBlockCtrl from './codeBlockCtrl'
import tableBlockCtrl from './tableBlockCtrl'
import tableDragBarCtrl from './tableDragBarCtrl'
import tableSelectCellsCtrl from './tableSelectCellsCtrl'
import coreApi from './core'
import marktextApi from './marktext'
import History from './history'
import arrowCtrl from './arrowCtrl'
import pasteCtrl from './pasteCtrl'
import copyCutCtrl from './copyCutCtrl'
import paragraphCtrl from './paragraphCtrl'
import tabCtrl from './tabCtrl'
import formatCtrl from './formatCtrl'
import searchCtrl from './searchCtrl'
import containerCtrl from './containerCtrl'
import htmlBlockCtrl from './htmlBlock'
import clickCtrl from './clickCtrl'
import inputCtrl from './inputCtrl'
import tocCtrl from './tocCtrl'
import emojiCtrl from './emojiCtrl'
import imageCtrl from './imageCtrl'
import linkCtrl from './linkCtrl'
import dragDropCtrl from './dragDropCtrl'
import footnoteCtrl from './footnoteCtrl'
import importMarkdown from '../utils/importMarkdown'
import { createPartitionMap } from './partitionMap'
import Cursor from '../selection/cursor'
import escapeCharactersMap, { escapeCharacters } from '../parser/escapeCharacter'

const FALLBACK_IDLE_DELAY_MS = 150
const INITIAL_RENDER_CHUNK_DELAY_MS = 2000
const PARTITION_HYDRATION_CHUNK_SIZE = 24

const scheduleIdleTask = callback => {
  if (typeof window.requestIdleCallback === 'function') {
    return {
      type: 'idle',
      id: window.requestIdleCallback(callback, { timeout: 1000 })
    }
  }

  return {
    type: 'timeout',
    id: window.setTimeout(callback, FALLBACK_IDLE_DELAY_MS)
  }
}

const cancelIdleTask = task => {
  if (!task) {
    return
  }

  if (task.type === 'idle' && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(task.id)
  } else {
    window.clearTimeout(task.id)
  }
}

const scheduleFrameTask = callback => {
  if (typeof window.requestAnimationFrame === 'function') {
    return {
      type: 'frame',
      id: window.requestAnimationFrame(callback)
    }
  }

  return {
    type: 'timeout',
    id: window.setTimeout(callback, 16)
  }
}

const cancelFrameTask = task => {
  if (!task) {
    return
  }

  if (task.type === 'frame' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(task.id)
  } else {
    window.clearTimeout(task.id)
  }
}

const prototypes = [
  coreApi,
  marktextApi,
  tabCtrl,
  enterCtrl,
  updateCtrl,
  backspaceCtrl,
  deleteCtrl,
  codeBlockCtrl,
  arrowCtrl,
  pasteCtrl,
  copyCutCtrl,
  tableBlockCtrl,
  tableDragBarCtrl,
  tableSelectCellsCtrl,
  paragraphCtrl,
  formatCtrl,
  searchCtrl,
  containerCtrl,
  htmlBlockCtrl,
  clickCtrl,
  inputCtrl,
  tocCtrl,
  emojiCtrl,
  imageCtrl,
  linkCtrl,
  dragDropCtrl,
  footnoteCtrl,
  importMarkdown
]

class ContentState {
  constructor (muya, options) {
    const { bulletListMarker } = options

    this.muya = muya
    Object.assign(this, options)

    // Use to cache the keys which you don't want to remove.
    this.exemption = new Set()
    this.blockMap = new Map()
    this.partitionMap = []
    this.partitionVersion = 0
    this.canonicalMarkdown = ''
    this.blocks = [this.createBlockP()]
    this.stateRender = new StateRender(muya)
    this.renderRange = [null, null]
    this.initialRenderTask = null
    this.partitionHydrationTask = null
    this.viewportRenderTask = null
    this.currentCursor = null
    // you'll select the outmost block of current cursor when you click the front icon.
    this.selectedBlock = null
    this._selectedImage = null
    this.dropAnchor = null
    this.prevCursor = null
    this.historyTimer = null
    this.history = new History(this)
    this.turndownConfig = Object.assign({}, DEFAULT_TURNDOWN_CONFIG, { bulletListMarker })
    // table drag bar
    this.dragInfo = null
    this.isDragTableBar = false
    this.dragEventIds = []
    // table cell select
    this.cellSelectInfo = null
    this._selectedTableCells = null
    this.cellSelectEventIds = []
    this.init()
  }

  set selectedTableCells (info) {
    const oldSelectedTableCells = this._selectedTableCells
    if (!info && !!oldSelectedTableCells) {
      const selectedCells = this.muya.container.querySelectorAll('.ag-cell-selected')

      for (const cell of Array.from(selectedCells)) {
        cell.classList.remove('ag-cell-selected')
        cell.classList.remove('ag-cell-border-top')
        cell.classList.remove('ag-cell-border-right')
        cell.classList.remove('ag-cell-border-bottom')
        cell.classList.remove('ag-cell-border-left')
      }
    }
    this._selectedTableCells = info
  }

  get selectedTableCells () {
    return this._selectedTableCells
  }

  set selectedImage (image) {
    const oldSelectedImage = this._selectedImage
    // if there is no selected image, remove selected status of current selected image.
    if (!image && oldSelectedImage) {
      const selectedImages = this.muya.container.querySelectorAll('.ag-inline-image-selected')
      for (const img of selectedImages) {
        img.classList.remove('ag-inline-image-selected')
      }
    }
    this._selectedImage = image
  }

  get selectedImage () {
    return this._selectedImage
  }

  set cursor (cursor) {
    if (!(cursor instanceof Cursor)) {
      cursor = new Cursor(cursor)
    }

    this.prevCursor = this.currentCursor
    this.currentCursor = cursor

    const getHistoryState = () => {
      const { blocks, renderRange, currentCursor } = this
      return {
        blocks,
        renderRange,
        cursor: currentCursor
      }
    }

    if (!cursor.noHistory) {
      // Mark cursor's root blocks as dirty (text/structure likely changed)
      this._markRootDirty(cursor.start.key)
      if (cursor.end.key !== cursor.start.key) {
        this._markRootDirty(cursor.end.key)
      }

      if (
        this.prevCursor &&
        (
          this.prevCursor.start.key !== cursor.start.key ||
          this.prevCursor.end.key !== cursor.end.key
        )
      ) {
        // Cross-block change: also mark previous cursor's roots dirty
        this._markRootDirty(this.prevCursor.start.key)
        if (this.prevCursor.end.key !== this.prevCursor.start.key) {
          this._markRootDirty(this.prevCursor.end.key)
        }
        // Push history immediately
        this.history.push(getHistoryState())
      } else {
        // WORKAROUND: The current engine doesn't support a smart history and we
        // need to store the whole state. Therefore, we push history only when the
        // user stops typing. Pushing one pending entry allows us to commit the
        // change before an undo action is triggered to partially solve #1321.
        if (this.historyTimer) clearTimeout(this.historyTimer)
        this.history.pushPending(getHistoryState())

        this.historyTimer = setTimeout(() => {
          this.history.commitPending()
        }, 2000)
      }
    }
  }

  get cursor () {
    return this.currentCursor
  }

  init () {
    const lastBlock = this.getLastBlock()
    const { key, text } = lastBlock
    const offset = text.length
    this.searchMatches = {
      value: '', // the search value
      matches: [], // matches
      index: -1 // active match
    }
    this.cursor = {
      start: { key, offset },
      end: { key, offset }
    }
  }

  getHistory () {
    const { stack, index } = this.history
    return { stack, index }
  }

  setHistory ({ stack, index }) {
    Object.assign(this.history, { stack, index })
  }

  setCursor () {
    selection.setCursorRange(this.cursor)
  }

  setNextRenderRange () {
    const { start, end } = this.cursor
    const startBlock = this.getBlock(start.key)
    const endBlock = this.getBlock(end.key)
    const startOutMostBlock = this.findOutMostBlock(startBlock)
    const endOutMostBlock = this.findOutMostBlock(endBlock)

    this.renderRange = [startOutMostBlock.preSibling, endOutMostBlock.nextSibling]
  }

  postRender () {
    this.resizeLineNumber()
  }

  _cancelInitialRenderTask () {
    cancelIdleTask(this.initialRenderTask)
    this.initialRenderTask = null
  }

  _cancelPartitionHydrationTask () {
    cancelIdleTask(this.partitionHydrationTask)
    this.partitionHydrationTask = null
  }

  _cancelViewportRenderTask () {
    cancelFrameTask(this.viewportRenderTask)
    this.viewportRenderTask = null
  }

  cancelPartitionHydration () {
    this._cancelPartitionHydrationTask()
  }

  _linkRootBlocks () {
    for (let i = 0; i < this.blocks.length; i++) {
      const block = this.blocks[i]
      block.parent = null
      block.preSibling = i > 0 ? this.blocks[i - 1].key : null
      block.nextSibling = i < this.blocks.length - 1 ? this.blocks[i + 1].key : null
    }
  }

  _assignRootEstimates (blocks, partitionStartIndex = 0) {
    if (!this.partitionMap.length) {
      return
    }

    let partitionIndex = partitionStartIndex
    for (const block of blocks) {
      const partition = this.partitionMap[Math.min(partitionIndex, this.partitionMap.length - 1)]
      if (partition && typeof partition.estimatedHeight === 'number') {
        block.estimatedHeight = partition.estimatedHeight
      } else if (!block.estimatedHeight) {
        block.estimatedHeight = 24
      }
      partitionIndex++
    }
  }

  _getBlockHeight (block) {
    if (typeof block.measuredHeight === 'number' && block.measuredHeight > 0) {
      return block.measuredHeight
    }
    if (typeof block.estimatedHeight === 'number' && block.estimatedHeight > 0) {
      return block.estimatedHeight
    }
    return 24
  }

  _getActiveRootKeys () {
    const keys = new Set()
    const activeBlocks = this.getActiveBlocks()
    for (const block of activeBlocks) {
      const root = this.findOutMostBlock(block)
      if (root) {
        keys.add(root.key)
      }
    }
    return keys
  }

  _setRenderState (blocks, renderState) {
    for (const block of blocks) {
      block.renderState = renderState
    }
  }

  _getVirtualRange () {
    const { blocks } = this
    if (blocks.length <= 80) {
      return [0, blocks.length]
    }

    const container = this.muya.container
    const viewportHeight = Math.max(1, container.clientHeight || 0)
    const scrollTop = Math.max(0, container.scrollTop || 0)
    const buffer = viewportHeight
    const startBound = Math.max(0, scrollTop - buffer)
    const endBound = scrollTop + viewportHeight + buffer
    const activeRoots = this._getActiveRootKeys()

    let offset = 0
    let startIndex = 0
    let endIndex = blocks.length

    for (let i = 0; i < blocks.length; i++) {
      const height = this._getBlockHeight(blocks[i])
      const nextOffset = offset + height
      if (nextOffset >= startBound && startIndex === 0) {
        startIndex = i
      }
      if (offset > endBound) {
        endIndex = i
        break
      }
      offset = nextOffset
    }

    if (startIndex > 0) {
      startIndex = Math.max(0, startIndex - 2)
    }
    if (endIndex < blocks.length) {
      endIndex = Math.min(blocks.length, endIndex + 2)
    }

    for (let i = 0; i < blocks.length; i++) {
      if (activeRoots.has(blocks[i].key)) {
        startIndex = Math.min(startIndex, i)
        endIndex = Math.max(endIndex, i + 1)
      }
    }

    return [startIndex, endIndex]
  }

  _getViewportAnchor () {
    const container = this.muya.container
    const root = this.stateRender.container || container.children[0]
    if (!container || !root || !root.children.length) {
      return null
    }

    const containerTop = container.getBoundingClientRect().top
    for (const dom of Array.from(root.children)) {
      const rect = dom.getBoundingClientRect()
      if (rect.bottom >= containerTop) {
        return {
          key: dom.id,
          top: rect.top - containerTop
        }
      }
    }

    return null
  }

  _restoreViewportAnchor (anchor) {
    if (!anchor || !anchor.key) {
      return
    }

    const container = this.muya.container
    if (!container || container.scrollTop <= 0) {
      return
    }

    const dom = document.querySelector(`#${anchor.key}`)
    if (!dom) {
      return
    }

    const nextTop = dom.getBoundingClientRect().top - container.getBoundingClientRect().top
    const delta = nextTop - anchor.top
    if (Math.abs(delta) > 1) {
      container.scrollTop += delta
    }
  }

  _applyVirtualizationState () {
    const [startIndex, endIndex] = this._getVirtualRange()
    const activeRoots = this._getActiveRootKeys()
    let changed = false

    for (let i = 0; i < this.blocks.length; i++) {
      const block = this.blocks[i]
      const shouldRender = (
        i >= startIndex &&
        i < endIndex
      ) || activeRoots.has(block.key) || block.functionType === 'partitionPlaceholder'

      const nextRenderState = shouldRender ? 'rendered' : 'placeholder'
      if (block.renderState !== nextRenderState) {
        changed = true
      }
      block.renderState = nextRenderState
    }

    return { startIndex, endIndex, changed }
  }

  _createPartitionPlaceholder (rawStartOffset, partitionStartIndex, partitionEndIndex) {
    if (partitionStartIndex >= partitionEndIndex || !this.partitionMap.length) {
      return null
    }

    const rawEndOffset = partitionEndIndex >= this.partitionMap.length
      ? this.canonicalMarkdown.length
      : this.partitionMap[partitionEndIndex - 1].endOffset
    const partitions = this.partitionMap.slice(partitionStartIndex, partitionEndIndex)
    const estimatedHeight = partitions.reduce((total, partition) => total + partition.estimatedHeight, 0)

    return this.createBlock('pre', {
      functionType: 'partitionPlaceholder',
      editable: false,
      rawMarkdown: this.canonicalMarkdown.slice(rawStartOffset, rawEndOffset),
      rawStartOffset,
      rawEndOffset,
      partitionStartIndex,
      partitionEndIndex,
      partitionIds: partitions.map(partition => partition.id),
      estimatedHeight
    })
  }

  importPartitionedMarkdown (markdown, options = {}) {
    this._cancelInitialRenderTask()
    this._cancelPartitionHydrationTask()
    this.canonicalMarkdown = markdown
    this.partitionMap = createPartitionMap(markdown, ++this.partitionVersion)

    const initialPartitionCount = Math.max(1, options.initialPartitionCount || 120)
    if (this.partitionMap.length <= initialPartitionCount) {
      this.blocks = this.markdownToState(markdown)
      this._linkRootBlocks()
      this._rebuildBlockMap()
      return { isPartitioned: false, parsedPartitionCount: this.partitionMap.length }
    }

    const parsedPartitionCount = Math.max(1, Math.min(initialPartitionCount - 1, this.partitionMap.length - 1))
    const initialEndOffset = this.partitionMap[parsedPartitionCount - 1].endOffset
    const initialMarkdown = markdown.slice(0, initialEndOffset)
    const parsedBlocks = this.markdownToState(initialMarkdown)
    const tailPlaceholder = this._createPartitionPlaceholder(
      initialEndOffset,
      parsedPartitionCount,
      this.partitionMap.length
    )

    this.blocks = tailPlaceholder
      ? parsedBlocks.concat(tailPlaceholder)
      : parsedBlocks

    this._assignRootEstimates(this.blocks, 0)

    if (!this.blocks.length) {
      this.blocks = [this.createBlockP()]
    }

    this._linkRootBlocks()
    this._assignRootEstimates(this.blocks, 0)
    this._rebuildBlockMap()
    return { isPartitioned: true, parsedPartitionCount }
  }

  _replaceRootBlockWithBlocks (oldBlock, newBlocks) {
    const index = this.blocks.findIndex(block => block.key === oldBlock.key)
    if (index === -1) {
      return false
    }

    this.blocks.splice(index, 1, ...newBlocks)
    this._linkRootBlocks()
    this._rebuildBlockMap()
    return true
  }

  _renderPartitionReplacement (oldBlock, newBlocks) {
    const { searchMatches: { matches, index } } = this
    matches.forEach((m, i) => {
      m.active = i === index
    })
    this.stateRender.collectLabels(this.blocks)
    this.stateRender.replaceRender(oldBlock.key, newBlocks, this.getActiveBlocks(), matches)
    this.postRender()
  }

  _measureRenderedRootBlocks () {
    for (const block of this.blocks) {
      if (block.renderState === 'placeholder') {
        continue
      }
      const dom = document.querySelector(`#${block.key}`)
      if (dom) {
        block.measuredHeight = dom.offsetHeight || block.measuredHeight || block.estimatedHeight
      }
    }
  }

  _schedulePartitionHydration (chunkSize = PARTITION_HYDRATION_CHUNK_SIZE) {
    this._cancelPartitionHydrationTask()
    const expectedVersion = this.partitionVersion

    const hydrateNextChunk = () => {
      this.partitionHydrationTask = null
      if (expectedVersion !== this.partitionVersion) {
        return
      }

      const placeholder = this.blocks.find(block => block.functionType === 'partitionPlaceholder')
      if (!placeholder) {
        return
      }

      const { partitionStartIndex, partitionEndIndex, rawStartOffset } = placeholder
      const chunkEndIndex = Math.min(partitionEndIndex, partitionStartIndex + chunkSize)
      const chunkEndOffset = chunkEndIndex >= partitionEndIndex
        ? placeholder.rawEndOffset
        : this.partitionMap[chunkEndIndex - 1].endOffset
      const chunkMarkdown = this.canonicalMarkdown.slice(rawStartOffset, chunkEndOffset)
      const parsedBlocks = this.markdownToState(chunkMarkdown)
      this._assignRootEstimates(parsedBlocks, partitionStartIndex)
      const nextPlaceholder = chunkEndIndex < partitionEndIndex
        ? this._createPartitionPlaceholder(chunkEndOffset, chunkEndIndex, partitionEndIndex)
        : null
      this._setRenderState(parsedBlocks, 'rendered')
      if (nextPlaceholder) {
        nextPlaceholder.renderState = 'placeholder'
      }
      const replacement = nextPlaceholder
        ? parsedBlocks.concat(nextPlaceholder)
        : parsedBlocks

      if (!replacement.length) {
        return
      }

      if (this._replaceRootBlockWithBlocks(placeholder, replacement)) {
        this._applyVirtualizationState()
        this._renderPartitionReplacement(placeholder, replacement)
      }

      if (nextPlaceholder) {
        this.partitionHydrationTask = scheduleIdleTask(hydrateNextChunk)
      }
    }

    this.partitionHydrationTask = {
      type: 'timeout',
      id: window.setTimeout(() => {
        this.partitionHydrationTask = scheduleIdleTask(hydrateNextChunk)
      }, INITIAL_RENDER_CHUNK_DELAY_MS)
    }
  }

  _scheduleInitialRenderChunks (blocks, activeBlocks, matches, chunkSize = 120) {
    const pendingBlocks = blocks.slice()
    if (!pendingBlocks.length) {
      if (this.blocks.some(block => block.functionType === 'partitionPlaceholder')) {
        this._schedulePartitionHydration()
      }
      return
    }

    const renderNextChunk = () => {
      const chunk = pendingBlocks.splice(0, chunkSize)
      if (!chunk.length) {
        this.initialRenderTask = null
        if (this.blocks.some(block => block.functionType === 'partitionPlaceholder')) {
          this._schedulePartitionHydration()
        }
        return
      }

      this._setRenderState(chunk, 'rendered')
      this.stateRender.appendRender(chunk, activeBlocks, matches)
      this.renderRange[1] = chunk[chunk.length - 1].nextSibling
      this._measureRenderedRootBlocks()
      if (pendingBlocks.length) {
        this._applyVirtualizationState()
        this.initialRenderTask = scheduleIdleTask(renderNextChunk)
      } else {
        this.initialRenderTask = null
      }
    }

    this.initialRenderTask = {
      type: 'timeout',
      id: window.setTimeout(() => {
        this.initialRenderTask = scheduleIdleTask(renderNextChunk)
      }, INITIAL_RENDER_CHUNK_DELAY_MS)
    }
  }

  render (isRenderCursor = true, clearCache = false) {
    this._cancelInitialRenderTask()
    this._cancelPartitionHydrationTask()
    this._cancelViewportRenderTask()
    const { blocks, searchMatches: { matches, index } } = this
    const activeBlocks = this.getActiveBlocks()
    if (clearCache) {
      this.stateRender.tokenCache.clear()
    }
    matches.forEach((m, i) => {
      m.active = i === index
    })
    this._applyVirtualizationState()
    this.setNextRenderRange()
    this.stateRender.collectLabels(blocks)
    this.stateRender.render(blocks, activeBlocks, matches)
    if (isRenderCursor) {
      this.setCursor()
    } else {
      this.muya.blur()
    }
    this.postRender()
    this._measureRenderedRootBlocks()
  }

  refreshViewport (isRenderCursor = false) {
    const { blocks, searchMatches: { matches, index } } = this
    const activeBlocks = this.getActiveBlocks()
    matches.forEach((m, i) => {
      m.active = i === index
    })
    const anchor = this._getViewportAnchor()
    const { changed } = this._applyVirtualizationState()
    if (!changed && !isRenderCursor) {
      this._measureRenderedRootBlocks()
      return
    }
    this.stateRender.collectLabels(blocks)
    this.stateRender.render(blocks, activeBlocks, matches)
    if (isRenderCursor) {
      this.setCursor()
    }
    this.postRender()
    this._restoreViewportAnchor(anchor)
    this._measureRenderedRootBlocks()
  }

  scheduleViewportRefresh (isRenderCursor = false) {
    if (this.viewportRenderTask) {
      return
    }

    this.viewportRenderTask = scheduleFrameTask(() => {
      this.viewportRenderTask = null
      this.refreshViewport(isRenderCursor)
    })
  }

  renderInitial (isRenderCursor = true, blockLimit = 120) {
    this._cancelInitialRenderTask()
    this._cancelViewportRenderTask()

    const { blocks, searchMatches: { matches, index } } = this
    const activeBlocks = this.getActiveBlocks()
    let visibleBlockCount = Math.max(1, Math.min(blockLimit, blocks.length))
    if (
      visibleBlockCount < blocks.length &&
      blocks[visibleBlockCount] &&
      blocks[visibleBlockCount].functionType === 'partitionPlaceholder'
    ) {
      visibleBlockCount++
    }
    const initialBlocks = blocks.slice(0, visibleBlockCount)

    matches.forEach((m, i) => {
      m.active = i === index
    })

    this.stateRender.tokenCache.clear()
    this._applyVirtualizationState()
    const firstRenderedBlock = initialBlocks[0]
    const lastRenderedBlock = initialBlocks[initialBlocks.length - 1]
    this.renderRange = [
      firstRenderedBlock ? firstRenderedBlock.preSibling : null,
      lastRenderedBlock ? lastRenderedBlock.nextSibling : null
    ]
    this.stateRender.collectLabels(blocks)
    this.stateRender.render(initialBlocks, activeBlocks, matches)

    const cursorRendered = activeBlocks.every(block => initialBlocks.some(rendered => rendered.key === block.key))
    if (isRenderCursor && cursorRendered) {
      this.setCursor()
    } else if (!isRenderCursor) {
      this.muya.blur()
    }

    this.postRender()

    if (visibleBlockCount < blocks.length) {
      this._scheduleInitialRenderChunks(blocks.slice(visibleBlockCount), activeBlocks, matches)
    } else if (blocks.some(block => block.functionType === 'partitionPlaceholder')) {
      this._schedulePartitionHydration()
    }
  }

  partialRender (isRenderCursor = true) {
    const { blocks, searchMatches: { matches, index } } = this
    const activeBlocks = this.getActiveBlocks()
    const [startKey, endKey] = this.renderRange
    matches.forEach((m, i) => {
      m.active = i === index
    })

    // The `endKey` may already be removed from blocks if range was selected via keyboard (GH#1854).
    let startIndex = startKey ? blocks.findIndex(block => block.key === startKey) : 0
    if (startIndex === -1) {
      startIndex = 0
    }

    let endIndex = blocks.length
    if (endKey) {
      const tmpEndIndex = blocks.findIndex(block => block.key === endKey)
      if (tmpEndIndex >= 0) {
        endIndex = tmpEndIndex + 1
      }
    }

    const blocksToRender = blocks.slice(startIndex, endIndex)

    this.setNextRenderRange()
    this.stateRender.collectLabels(blocks)
    this.stateRender.partialRender(blocksToRender, activeBlocks, matches, startKey, endKey)
    if (isRenderCursor) {
      this.setCursor()
    } else {
      this.muya.blur()
    }
    this.postRender()
  }

  singleRender (block, isRenderCursor = true) {
    const { blocks, searchMatches: { matches, index } } = this
    const activeBlocks = this.getActiveBlocks()
    matches.forEach((m, i) => {
      m.active = i === index
    })
    this.setNextRenderRange()
    this.stateRender.collectLabels(blocks)
    this.stateRender.singleRender(block, activeBlocks, matches)
    if (isRenderCursor) {
      this.setCursor()
    } else {
      this.muya.blur()
    }
    this.postRender()
  }

  /**
   * A block in MarkText present a paragraph(block syntax in GFM) or a line in paragraph.
   * a `span` block must in a `p block` or `pre block` and `p block`'s children must be `span` blocks.
   */
  createBlock (type = 'span', extras = {}) {
    const key = getUniqueId()
    const blockData = {
      key,
      text: '',
      type,
      editable: true,
      parent: null,
      preSibling: null,
      nextSibling: null,
      children: []
    }

    // give span block a default functionType `paragraphContent`
    if (type === 'span' && !extras.functionType) {
      blockData.functionType = 'paragraphContent'
    }

    if (extras.functionType === 'codeContent' && extras.text) {
      const CHAR_REG = new RegExp(`(${escapeCharacters.join('|')})`, 'gi')
      extras.text = extras.text.replace(CHAR_REG, (_, p) => {
        return escapeCharactersMap[p]
      })
    }

    Object.assign(blockData, extras)
    this.blockMap.set(key, blockData)
    return blockData
  }

  createBlockP (text = '') {
    const pBlock = this.createBlock('p')
    const contentBlock = this.createBlock('span', { text })
    this.appendChild(pBlock, contentBlock)
    return pBlock
  }

  isCollapse (cursor = this.cursor) {
    const { start, end } = cursor
    return start.key === end.key && start.offset === end.offset
  }

  // getBlocks
  getBlocks () {
    return this.blocks
  }

  /**
   * Rebuild blockMap from scratch by walking the entire block tree.
   * Used after operations that replace the entire tree (import, undo/redo).
   */
  _rebuildBlockMap () {
    this.blockMap.clear()
    const walk = blocks => {
      for (const block of blocks) {
        this.blockMap.set(block.key, block)
        if (block.children.length) {
          walk(block.children)
        }
      }
    }
    walk(this.blocks)
  }

  /**
   * Remove a block and all its descendants from blockMap.
   */
  _removeFromBlockMap (block) {
    this.blockMap.delete(block.key)
    if (block.children.length) {
      for (const child of block.children) {
        this._removeFromBlockMap(child)
      }
    }
  }

  /**
   * Add a block and all its descendants to blockMap.
   */
  _addToBlockMap (block) {
    this.blockMap.set(block.key, block)
    if (block.children.length) {
      for (const child of block.children) {
        this._addToBlockMap(child)
      }
    }
  }

  getCursor () {
    return this.cursor
  }

  getBlock (key) {
    if (!key) return null
    return this.blockMap.get(key) || null
  }

  copyBlock (origin) {
    const copiedBlock = deepCopy(origin)
    const travel = (block, parent, preBlock, nextBlock) => {
      const key = getUniqueId()
      block.key = key
      block.parent = parent ? parent.key : null
      block.preSibling = preBlock ? preBlock.key : null
      block.nextSibling = nextBlock ? nextBlock.key : null
      this.blockMap.set(key, block)
      const { children } = block
      const len = children.length
      if (children && len) {
        let i
        for (i = 0; i < len; i++) {
          const b = children[i]
          const preB = i >= 1 ? children[i - 1] : null
          const nextB = i < len - 1 ? children[i + 1] : null
          travel(b, block, preB, nextB)
        }
      }
    }

    travel(copiedBlock, null, null, null)
    return copiedBlock
  }

  getParent (block) {
    if (block && block.parent) {
      return this.getBlock(block.parent)
    }
    return null
  }

  // return block and its parents
  getParents (block) {
    const result = []
    result.push(block)
    let parent = this.getParent(block)
    while (parent) {
      result.push(parent)
      parent = this.getParent(parent)
    }
    return result
  }

  getPreSibling (block) {
    return block.preSibling ? this.getBlock(block.preSibling) : null
  }

  getNextSibling (block) {
    return block.nextSibling ? this.getBlock(block.nextSibling) : null
  }

  /**
   * if target is descendant of parent return true, else return false
   * @param  {[type]}  parent [description]
   * @param  {[type]}  target [description]
   * @return {Boolean}        [description]
   */
  isInclude (parent, target) {
    const children = parent.children
    if (children.length === 0) {
      return false
    } else {
      if (children.some(child => child.key === target.key)) {
        return true
      } else {
        return children.some(child => this.isInclude(child, target))
      }
    }
  }

  removeTextOrBlock (block) {
    if (block.functionType === 'languageInput') return
    const checkerIn = block => {
      if (this.exemption.has(block.key)) {
        return true
      } else {
        const parent = this.getBlock(block.parent)
        return parent ? checkerIn(parent) : false
      }
    }

    const checkerOut = block => {
      const children = block.children
      if (children.length) {
        if (children.some(child => this.exemption.has(child.key))) {
          return true
        } else {
          return children.some(child => checkerOut(child))
        }
      } else {
        return false
      }
    }

    if (checkerIn(block) || checkerOut(block)) {
      block.text = ''
      const { children } = block
      if (children.length) {
        children.forEach(child => this.removeTextOrBlock(child))
      }
    } else if (block.editable) {
      this.removeBlock(block)
    }
  }

  /**
   * remove blocks between before and after, and includes after block.
   */
  removeBlocks (before, after, isRemoveAfter = true, isRecursion = false) {
    if (!isRecursion) {
      if (/td|th/.test(before.type)) {
        this.exemption.add(this.closest(before, 'figure'))
      }
      if (/td|th/.test(after.type)) {
        this.exemption.add(this.closest(after, 'figure'))
      }
    }
    let nextSibling = this.getBlock(before.nextSibling)
    let beforeEnd = false
    while (nextSibling) {
      if (nextSibling.key === after.key || this.isInclude(nextSibling, after)) {
        beforeEnd = true
        break
      }
      this.removeTextOrBlock(nextSibling)
      nextSibling = this.getBlock(nextSibling.nextSibling)
    }
    if (!beforeEnd) {
      const parent = this.getParent(before)
      if (parent) {
        this.removeBlocks(parent, after, false, true)
      }
    }
    let preSibling = this.getBlock(after.preSibling)
    let afterEnd = false
    while (preSibling) {
      if (preSibling.key === before.key || this.isInclude(preSibling, before)) {
        afterEnd = true
        break
      }
      this.removeTextOrBlock(preSibling)
      preSibling = this.getBlock(preSibling.preSibling)
    }
    if (!afterEnd) {
      const parent = this.getParent(after)
      if (parent) {
        const removeAfter = isRemoveAfter && (this.isOnlyRemoveableChild(after))
        this.removeBlocks(before, parent, removeAfter, true)
      }
    }
    if (isRemoveAfter) {
      this.removeTextOrBlock(after)
    }
    if (!isRecursion) {
      this.exemption.clear()
    }
  }

  /**
   * Mark the root-level ancestor of `blockKey` as dirty in the history so
   * the next push deep-copies it instead of sharing from the previous snapshot.
   * Safe to call before `this.history` is initialised (no-ops).
   */
  _markRootDirty (blockKey) {
    if (!this.history) return
    const block = this.getBlock(blockKey)
    if (block) {
      const root = this.findOutMostBlock(block)
      this.history.markRootDirty(root.key)
    }
  }

  removeBlock (block) {
    // Use blockMap to find the parent, then search only its children array
    const parent = block.parent ? this.blockMap.get(block.parent) : null
    const siblings = parent ? parent.children : this.blocks
    const idx = siblings.findIndex(b => b.key === block.key)
    if (idx === -1) return

    const preSibling = this.getBlock(block.preSibling)
    const nextSibling = this.getBlock(block.nextSibling)

    // Mark affected roots dirty (sibling pointers change on adjacent blocks)
    const root = this.findOutMostBlock(block)
    if (this.history) this.history.markRootDirty(root.key)
    if (preSibling) {
      const preRoot = this.findOutMostBlock(preSibling)
      if (preRoot.key !== root.key && this.history) this.history.markRootDirty(preRoot.key)
    }
    if (nextSibling) {
      const nextRoot = this.findOutMostBlock(nextSibling)
      if (nextRoot.key !== root.key && this.history) this.history.markRootDirty(nextRoot.key)
    }

    if (preSibling) {
      preSibling.nextSibling = nextSibling ? nextSibling.key : null
    }
    if (nextSibling) {
      nextSibling.preSibling = preSibling ? preSibling.key : null
    }

    // Remove block and its descendants from blockMap
    this._removeFromBlockMap(block)

    siblings.splice(idx, 1)
  }

  getActiveBlocks () {
    const result = []
    let block = this.getBlock(this.cursor.start.key)
    if (block) {
      result.push(block)
    }
    while (block && block.parent) {
      block = this.getBlock(block.parent)
      result.push(block)
    }
    return result
  }

  insertAfter (newBlock, oldBlock) {
    const siblings = oldBlock.parent ? this.getBlock(oldBlock.parent).children : this.blocks
    const oldNextSibling = this.getBlock(oldBlock.nextSibling)
    const index = this.findIndex(siblings, oldBlock)
    siblings.splice(index + 1, 0, newBlock)
    oldBlock.nextSibling = newBlock.key
    newBlock.parent = oldBlock.parent
    newBlock.preSibling = oldBlock.key
    if (oldNextSibling) {
      newBlock.nextSibling = oldNextSibling.key
      oldNextSibling.preSibling = newBlock.key
    }

    // Mark affected roots dirty
    const root = this.findOutMostBlock(oldBlock)
    if (this.history) this.history.markRootDirty(root.key)
    if (oldNextSibling) {
      const nextRoot = this.findOutMostBlock(oldNextSibling)
      if (nextRoot.key !== root.key && this.history) this.history.markRootDirty(nextRoot.key)
    }
  }

  insertBefore (newBlock, oldBlock) {
    const siblings = oldBlock.parent ? this.getBlock(oldBlock.parent).children : this.blocks
    const oldPreSibling = this.getBlock(oldBlock.preSibling)
    const index = this.findIndex(siblings, oldBlock)
    siblings.splice(index, 0, newBlock)
    oldBlock.preSibling = newBlock.key
    newBlock.parent = oldBlock.parent
    newBlock.nextSibling = oldBlock.key
    newBlock.preSibling = null

    if (oldPreSibling) {
      oldPreSibling.nextSibling = newBlock.key
      newBlock.preSibling = oldPreSibling.key
    }

    // Mark affected roots dirty
    const root = this.findOutMostBlock(oldBlock)
    if (this.history) this.history.markRootDirty(root.key)
    if (oldPreSibling) {
      const preRoot = this.findOutMostBlock(oldPreSibling)
      if (preRoot.key !== root.key && this.history) this.history.markRootDirty(preRoot.key)
    }
  }

  findOutMostBlock (block) {
    const parent = this.getBlock(block.parent)
    return parent ? this.findOutMostBlock(parent) : block
  }

  findIndex (children, block) {
    return children.findIndex(child => child === block)
  }

  prependChild (parent, block) {
    block.parent = parent.key
    block.preSibling = null
    if (parent.children.length) {
      block.nextSibling = parent.children[0].key
    }
    parent.children.unshift(block)

    const root = this.findOutMostBlock(parent)
    if (this.history) this.history.markRootDirty(root.key)
  }

  appendChild (parent, block) {
    const len = parent.children.length
    const lastChild = parent.children[len - 1]
    parent.children.push(block)
    block.parent = parent.key
    if (lastChild) {
      lastChild.nextSibling = block.key
      block.preSibling = lastChild.key
    } else {
      block.preSibling = null
    }
    block.nextSibling = null

    const root = this.findOutMostBlock(parent)
    if (this.history) this.history.markRootDirty(root.key)
  }

  replaceBlock (newBlock, oldBlock) {
    const blockList = oldBlock.parent ? this.getParent(oldBlock).children : this.blocks
    const index = this.findIndex(blockList, oldBlock)

    blockList.splice(index, 1, newBlock)
    newBlock.parent = oldBlock.parent
    newBlock.preSibling = oldBlock.preSibling
    newBlock.nextSibling = oldBlock.nextSibling

    this._removeFromBlockMap(oldBlock)
    this._addToBlockMap(newBlock)

    const root = this.findOutMostBlock(newBlock)
    if (this.history) this.history.markRootDirty(root.key)
  }

  canInserFrontMatter (block) {
    if (!block) return true
    const parent = this.getParent(block)
    return block.type === 'span' &&
      !block.preSibling &&
      !parent.preSibling &&
      !parent.parent
  }

  isFirstChild (block) {
    return !block.preSibling
  }

  isLastChild (block) {
    return !block.nextSibling
  }

  isOnlyChild (block) {
    return !block.nextSibling && !block.preSibling
  }

  isOnlyRemoveableChild (block) {
    if (block.editable === false) return false
    const parent = this.getParent(block)
    return (parent ? parent.children : this.blocks).filter(child => child.editable && child.functionType !== 'languageInput').length === 1
  }

  getLastChild (block) {
    if (block) {
      const len = block.children.length
      if (len) {
        return block.children[len - 1]
      }
    }
    return null
  }

  firstInDescendant (block) {
    const children = block.children
    if (block.children.length === 0 && HAS_TEXT_BLOCK_REG.test(block.type)) {
      return block
    } else if (children.length) {
      if (
        children[0].type === 'input' ||
        (children[0].type === 'div' && children[0].editable === false)
      ) { // handle task item
        return this.firstInDescendant(children[1])
      } else {
        return this.firstInDescendant(children[0])
      }
    }
  }

  lastInDescendant (block) {
    if (block.children.length === 0 && HAS_TEXT_BLOCK_REG.test(block.type)) {
      return block
    } else if (block.children.length) {
      const children = block.children
      let lastChild = children[children.length - 1]
      while (lastChild.editable === false) {
        lastChild = this.getPreSibling(lastChild)
      }
      return this.lastInDescendant(lastChild)
    }
  }

  findPreBlockInLocation (block) {
    const parent = this.getParent(block)
    const preBlock = this.getPreSibling(block)
    if (
      block.preSibling &&
      preBlock.type !== 'input' &&
      preBlock.type !== 'div' &&
      preBlock.editable !== false
    ) { // handle task item and table
      return this.lastInDescendant(preBlock)
    } else if (parent) {
      return this.findPreBlockInLocation(parent)
    } else {
      return null
    }
  }

  findNextBlockInLocation (block) {
    const parent = this.getParent(block)
    const nextBlock = this.getNextSibling(block)

    if (
      nextBlock && nextBlock.editable !== false
    ) {
      return this.firstInDescendant(nextBlock)
    } else if (parent) {
      return this.findNextBlockInLocation(parent)
    } else {
      return null
    }
  }

  getPositionReference () {
    const { fontSize, lineHeight } = this.muya.options
    const { start } = this.cursor
    const block = this.getBlock(start.key)
    const { x, y, width } = selection.getCursorCoords()
    const height = fontSize * lineHeight
    const bottom = y + height
    const right = x + width
    const left = x
    const top = y
    return {
      getBoundingClientRect () {
        return { x, y, top, left, right, bottom, height, width }
      },
      clientWidth: width,
      clientHeight: height,
      id: block ? block.key : null
    }
  }

  getFirstBlock () {
    return this.firstInDescendant(this.blocks[0])
  }

  getLastBlock () {
    const { blocks } = this
    const len = blocks.length
    return this.lastInDescendant(blocks[len - 1])
  }

  getLastEditableBlock () {
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const block = this.lastInDescendant(this.blocks[i])
      if (block && block.editable !== false) {
        return block
      }
    }
    return this.getLastBlock()
  }

  closest (block, type) {
    if (!block) {
      return null
    }
    if (type instanceof RegExp ? type.test(block.type) : block.type === type) {
      return block
    } else {
      const parent = this.getParent(block)
      return this.closest(parent, type)
    }
  }

  getAnchor (block) {
    const { type, functionType } = block
    if (type !== 'span') {
      return null
    }

    if (functionType === 'codeContent' || functionType === 'cellContent') {
      return this.closest(block, 'figure') || this.closest(block, 'pre')
    } else {
      return this.getParent(block)
    }
  }

  clear () {
    this._cancelInitialRenderTask()
    this._cancelPartitionHydrationTask()
    this._cancelViewportRenderTask()
    this.history.clearHistory()
  }
}

prototypes.forEach(ctrl => ctrl(ContentState))

export default ContentState
