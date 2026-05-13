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
import DocumentModel from './documentModel'
import LayoutIndex from './layoutIndex'
import RenderScheduler, { RenderPriority } from './renderScheduler'
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
const URGENT_PARTITION_HYDRATION_CHUNK_SIZE = 6
const RENDER_SCHEDULER_CHUNK_SIZE = 12

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const getPartitionIndexForLine = (partitionMap, line) => {
  if (!Array.isArray(partitionMap) || !partitionMap.length || !Number.isInteger(line) || line < 0) {
    return -1
  }

  for (let i = 0; i < partitionMap.length; i++) {
    const partition = partitionMap[i]
    if (line <= partition.endLine) {
      return i
    }
  }

  return partitionMap.length - 1
}

const resolveTargetPartitionWindow = (partitionMap, targetLines, initialPartitionCount) => {
  if (!Array.isArray(targetLines) || !targetLines.length || !Array.isArray(partitionMap) || !partitionMap.length) {
    return null
  }

  const sortedTargetLines = targetLines
    .filter(line => Number.isInteger(line) && line >= 0)
    .sort((a, b) => a - b)

  if (!sortedTargetLines.length) {
    return null
  }

  const firstTargetLine = sortedTargetLines[0]
  const lastTargetLine = sortedTargetLines[sortedTargetLines.length - 1]
  const firstTargetIndex = getPartitionIndexForLine(partitionMap, firstTargetLine)
  const lastTargetIndex = getPartitionIndexForLine(partitionMap, lastTargetLine)

  if (firstTargetIndex === -1 || lastTargetIndex === -1) {
    return null
  }

  const windowSize = Math.max(1, initialPartitionCount)
  const contextBefore = Math.min(2, firstTargetIndex)
  const contextAfter = 2
  let parsedStartIndex = Math.max(0, firstTargetIndex - contextBefore)
  let parsedEndIndex = Math.min(
    partitionMap.length,
    Math.max(lastTargetIndex + 1 + contextAfter, parsedStartIndex + windowSize)
  )

  if (parsedEndIndex - parsedStartIndex < windowSize) {
    parsedStartIndex = Math.max(0, parsedEndIndex - windowSize)
  }

  return {
    parsedStartIndex,
    parsedEndIndex
  }
}

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
    this.documentModel = new DocumentModel()
    this.layoutIndex = new LayoutIndex()
    this.renderScheduler = new RenderScheduler()
    this.layoutEstimateOverrides = new Map()
    this.partitionMap = []
    this.partitionVersion = 0
    this.canonicalMarkdown = ''
    this.blocks = [this.createBlockP()]
    this.stateRender = new StateRender(muya)
    this.stateRender.setRenderStateResolver({
      isPlaceholder: block => this._getRenderState(block) === 'placeholder',
      getEstimatedHeight: block => this._getEstimatedHeight(block)
    })
    this.renderRange = [null, null]
    this.initialRenderTask = null
    this.urgentPartitionHydrationTask = null
    this.backgroundPartitionHydrationTask = null
    this.partitionHydrationRunId = 0
    this.viewportRenderTask = null
    this.renderSchedulerTask = null
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
      this.renderScheduler.invalidate('cursor')
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

  _cancelUrgentPartitionHydrationTask () {
    cancelFrameTask(this.urgentPartitionHydrationTask)
    this.urgentPartitionHydrationTask = null
  }

  _cancelBackgroundPartitionHydrationTask () {
    cancelIdleTask(this.backgroundPartitionHydrationTask)
    this.backgroundPartitionHydrationTask = null
  }

  _cancelPartitionHydrationTask () {
    this._cancelUrgentPartitionHydrationTask()
    this._cancelBackgroundPartitionHydrationTask()
    this.partitionHydrationRunId++
  }

  _cancelViewportRenderTask () {
    cancelFrameTask(this.viewportRenderTask)
    this.viewportRenderTask = null
  }

  _cancelRenderSchedulerTask () {
    if (this.renderSchedulerTask && this.renderSchedulerTask.type === 'frame') {
      cancelFrameTask(this.renderSchedulerTask)
    } else {
      cancelIdleTask(this.renderSchedulerTask)
    }
    this.renderSchedulerTask = null
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

  _syncDocumentModels () {
    this.documentModel.rebuildFromBlocks(this.blocks)
    this.layoutIndex.rebuild(this.blocks, this.partitionMap, this.layoutEstimateOverrides)
    this.renderScheduler.reconcile(this.blocks.map(block => block.key))
  }

  _assignRootEstimates (blocks, partitionStartIndex = 0) {
    if (!this.partitionMap.length) {
      return
    }

    let partitionIndex = partitionStartIndex
    for (const block of blocks) {
      const partition = this.partitionMap[Math.min(partitionIndex, this.partitionMap.length - 1)]
      if (partition && typeof partition.estimatedHeight === 'number') {
        this.layoutEstimateOverrides.set(block.key, partition.estimatedHeight)
      }
      partitionIndex++
    }
  }

  _getBlockHeight (block) {
    const node = this.layoutIndex.getNode(block.key)
    if (node) {
      return this.layoutIndex.getHeight(block.key)
    }
    return this.layoutEstimateOverrides.get(block.key) || 24
  }

  _getEstimatedHeight (block) {
    const node = this.layoutIndex.getNode(block.key)
    if (node) {
      return this.layoutIndex.getEstimatedHeight(block.key)
    }
    return this.layoutEstimateOverrides.get(block.key) || 24
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

  _getRenderState (block) {
    if (block.functionType === 'partitionPlaceholder') {
      return 'rendered'
    }
    return this.renderScheduler.isPlaceholder(block.key) ? 'placeholder' : 'rendered'
  }

  _setRenderState (blocks, renderState) {
    for (const block of blocks) {
      this.renderScheduler.setDomState(block.key, renderState === 'placeholder' ? 'placeholder' : 'mounted')
    }
  }

  _getVirtualRange () {
    const { blocks } = this
    if (this.layoutIndex.nodes.length !== blocks.length) {
      this._syncDocumentModels()
    }
    if (blocks.length <= 80) {
      return [0, blocks.length]
    }

    const container = this.muya.container
    const viewportHeight = Math.max(1, container.clientHeight || 0)
    const scrollTop = Math.max(0, container.scrollTop || 0)
    const activeRoots = this._getActiveRootKeys()
    let startIndex = 0
    let endIndex = blocks.length
    if (this.layoutIndex.nodes.length === blocks.length) {
      ;[startIndex, endIndex] = this.layoutIndex.getRangeForViewport(scrollTop, viewportHeight, viewportHeight)
    } else {
      const buffer = viewportHeight
      const startBound = Math.max(0, scrollTop - buffer)
      const endBound = scrollTop + viewportHeight + buffer
      let offset = 0
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

  _getViewportMetrics () {
    const container = this.muya.container || {}
    const viewportHeight = Math.max(1, container.clientHeight || 0)
    const scrollTop = Math.max(0, container.scrollTop || 0)
    return {
      scrollTop,
      viewportHeight,
      viewportTop: scrollTop,
      viewportBottom: scrollTop + viewportHeight,
      viewportCenter: scrollTop + (viewportHeight / 2)
    }
  }

  _selectPartitionHydrationTarget (chunkSize = PARTITION_HYDRATION_CHUNK_SIZE) {
    if (!this.blocks.some(block => block.functionType === 'partitionPlaceholder')) {
      return null
    }

    const activeRoots = this._getActiveRootKeys()
    const [virtualStart, virtualEnd] = this._getVirtualRange()
    const { viewportTop, viewportBottom, viewportCenter, viewportHeight } = this._getViewportMetrics()

    let offset = 0
    let bestTarget = null

    for (let i = 0; i < this.blocks.length; i++) {
      const block = this.blocks[i]
      const blockTop = offset
      const blockHeight = this._getBlockHeight(block)
      const blockBottom = blockTop + blockHeight

      if (block.functionType === 'partitionPlaceholder') {
        const viewportDistance = blockBottom < viewportTop
          ? viewportTop - blockBottom
          : (blockTop > viewportBottom ? blockTop - viewportBottom : 0)
        const virtualDistance = i < virtualStart
          ? virtualStart - i
          : (i >= virtualEnd ? i - virtualEnd + 1 : 0)
        let score = viewportDistance + (virtualDistance * viewportHeight)
        if (activeRoots.has(block.key)) {
          score -= viewportHeight * 2
        }

        if (!bestTarget || score < bestTarget.score) {
          const partitionCount = block.partitionEndIndex - block.partitionStartIndex
          const placeholderHeight = Math.max(1, blockBottom - blockTop)
          const focusOffset = clamp(viewportCenter - blockTop, 0, placeholderHeight)
          const focusRatio = clamp(focusOffset / placeholderHeight, 0, 0.999999)
          let chunkStartIndex = block.partitionStartIndex + Math.floor(focusRatio * partitionCount)
          const chunkRadius = Math.max(0, Math.floor((chunkSize - 1) / 2))
          chunkStartIndex = Math.max(block.partitionStartIndex, chunkStartIndex - chunkRadius)
          let chunkEndIndex = Math.min(block.partitionEndIndex, chunkStartIndex + chunkSize)
          chunkStartIndex = Math.max(block.partitionStartIndex, chunkEndIndex - chunkSize)

          const chunkStartOffset = chunkStartIndex <= block.partitionStartIndex
            ? block.rawStartOffset
            : this.partitionMap[chunkStartIndex].startOffset
          const chunkEndOffset = chunkEndIndex >= block.partitionEndIndex
            ? block.rawEndOffset
            : this.partitionMap[chunkEndIndex - 1].endOffset

          bestTarget = {
            block,
            index: i,
            score,
            viewportDistance,
            blockTop,
            blockBottom,
            chunkStartIndex,
            chunkEndIndex,
            chunkStartOffset,
            chunkEndOffset
          }
        }
      }

      offset = blockBottom
    }

    if (!bestTarget) {
      return null
    }

    const { block, chunkStartIndex, chunkEndIndex, chunkStartOffset, chunkEndOffset, viewportDistance } = bestTarget
    const beforePlaceholder = chunkStartIndex > block.partitionStartIndex
      ? this._createPartitionPlaceholder(
        block.rawStartOffset,
        block.partitionStartIndex,
        chunkStartIndex
      )
      : null
    const afterPlaceholder = chunkEndIndex < block.partitionEndIndex
      ? this._createPartitionPlaceholder(
        chunkEndOffset,
        chunkEndIndex,
        block.partitionEndIndex
      )
      : null
    return {
      block,
      chunkStartIndex,
      chunkEndIndex,
      chunkStartOffset,
      chunkEndOffset,
      viewportDistance,
      beforePlaceholder,
      afterPlaceholder
    }
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
    this._syncDocumentModels()
    this.renderScheduler.cancelLowerPriorityThan(RenderPriority.PREFETCH)
    const [startIndex, endIndex] = this._getVirtualRange()
    const activeRoots = this._getActiveRootKeys()
    let changed = false
    const immediateIds = []
    const viewportIds = []
    const prefetchIds = []

    for (let i = 0; i < this.blocks.length; i++) {
      const block = this.blocks[i]
      const shouldRender = (
        i >= startIndex &&
        i < endIndex
      ) || activeRoots.has(block.key) || block.functionType === 'partitionPlaceholder'

      const nextRenderState = shouldRender ? 'rendered' : 'placeholder'
      if (this._getRenderState(block) !== nextRenderState) {
        changed = true
      }
      this._setRenderState([block], nextRenderState)
      if (activeRoots.has(block.key)) {
        immediateIds.push(block.key)
      } else if (shouldRender) {
        viewportIds.push(block.key)
      } else {
        prefetchIds.push(block.key)
      }
    }

    this.renderScheduler.enqueue(immediateIds, 'cursor')
    this.renderScheduler.enqueue(viewportIds, 'viewport')
    this.renderScheduler.enqueue(prefetchIds, 'prefetch')
    return { startIndex, endIndex, changed }
  }

  _renderScheduledBlock (task, activeBlocks, matches) {
    const block = this.getBlock(task.blockId)
    if (!block || block.functionType === 'partitionPlaceholder') {
      return false
    }
    const currentState = this._getRenderState(block)
    if (currentState !== 'placeholder') {
      return false
    }
    if (!document.querySelector(`#${block.key}`)) {
      return false
    }

    this._setRenderState([block], 'rendered')
    this.stateRender.singleRender(block, activeBlocks, matches)
    return true
  }

  _drainRenderSchedulerQueue (chunkSize = RENDER_SCHEDULER_CHUNK_SIZE) {
    this.renderSchedulerTask = null
    const { searchMatches: { matches, index } } = this
    const activeBlocks = this.getActiveBlocks()
    matches.forEach((m, i) => {
      m.active = i === index
    })

    let renderedCount = 0
    let attempts = 0
    let task = null
    const maxAttempts = chunkSize * 4
    while (renderedCount < chunkSize && attempts < maxAttempts && (task = this.renderScheduler.flushNext())) {
      attempts++
      if (this._renderScheduledBlock(task, activeBlocks, matches)) {
        renderedCount++
      }
    }

    if (renderedCount > 0) {
      this.postRender()
      this._measureRenderedRootBlocks()
    }

    if (this.renderScheduler.queue.length) {
      this._scheduleRenderSchedulerDrain()
    }
  }

  _scheduleRenderSchedulerDrain (immediate = false) {
    if (this.renderSchedulerTask || !this.renderScheduler.queue.length) {
      return
    }

    if (immediate) {
      this.renderSchedulerTask = scheduleFrameTask(() => {
        this._drainRenderSchedulerQueue()
      })
    } else {
      this.renderSchedulerTask = scheduleIdleTask(() => {
        this._drainRenderSchedulerQueue()
      })
    }
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
    const placeholder = this.createBlock('pre', {
      functionType: 'partitionPlaceholder',
      editable: false,
      rawMarkdown: this.canonicalMarkdown.slice(rawStartOffset, rawEndOffset),
      rawStartOffset,
      rawEndOffset,
      partitionStartIndex,
      partitionEndIndex,
      partitionIds: partitions.map(partition => partition.id)
    })
    this.layoutEstimateOverrides.set(placeholder.key, estimatedHeight)
    return placeholder
  }

  importPartitionedMarkdown (markdown, options = {}) {
    this._cancelInitialRenderTask()
    this._cancelPartitionHydrationTask()
    this.canonicalMarkdown = markdown
    this.layoutEstimateOverrides.clear()
    this.partitionMap = createPartitionMap(markdown, ++this.partitionVersion)

    const initialPartitionCount = Math.max(1, options.initialPartitionCount || 120)
    if (this.partitionMap.length <= initialPartitionCount) {
      this.blocks = this.markdownToState(markdown)
      this._linkRootBlocks()
      this._rebuildBlockMap()
      this._syncDocumentModels()
      return { isPartitioned: false, parsedPartitionCount: this.partitionMap.length }
    }

    const targetWindow = resolveTargetPartitionWindow(
      this.partitionMap,
      options.targetLines,
      initialPartitionCount
    )
    const parsedStartIndex = targetWindow ? targetWindow.parsedStartIndex : 0
    const parsedEndIndex = targetWindow
      ? targetWindow.parsedEndIndex
      : Math.max(1, Math.min(initialPartitionCount - 1, this.partitionMap.length - 1))
    const initialStartOffset = parsedStartIndex <= 0 ? 0 : this.partitionMap[parsedStartIndex].startOffset
    const initialEndOffset = parsedEndIndex >= this.partitionMap.length
      ? markdown.length
      : this.partitionMap[parsedEndIndex - 1].endOffset
    const initialMarkdown = markdown.slice(initialStartOffset, initialEndOffset)
    const parsedBlocks = this.markdownToState(initialMarkdown)
    const beforePlaceholder = parsedStartIndex > 0
      ? this._createPartitionPlaceholder(0, 0, parsedStartIndex)
      : null
    const afterPlaceholder = parsedEndIndex < this.partitionMap.length
      ? this._createPartitionPlaceholder(
        initialEndOffset,
        parsedEndIndex,
        this.partitionMap.length
      )
      : null

    this.blocks = []
    if (beforePlaceholder) {
      this.blocks.push(beforePlaceholder)
    }
    this.blocks.push(...parsedBlocks)
    if (afterPlaceholder) {
      this.blocks.push(afterPlaceholder)
    }

    this._assignRootEstimates(parsedBlocks, parsedStartIndex)

    if (!this.blocks.length) {
      this.blocks = [this.createBlockP()]
    }

    this._linkRootBlocks()
    this._rebuildBlockMap()
    this._syncDocumentModels()
    return {
      isPartitioned: true,
      parsedPartitionCount: parsedEndIndex - parsedStartIndex,
      parsedPartitionStartIndex: parsedStartIndex,
      parsedPartitionEndIndex: parsedEndIndex
    }
  }

  _replaceRootBlockWithBlocks (oldBlock, newBlocks) {
    const index = this.blocks.findIndex(block => block.key === oldBlock.key)
    if (index === -1) {
      return false
    }

    this.layoutEstimateOverrides.delete(oldBlock.key)
    this.blocks.splice(index, 1, ...newBlocks)
    this._linkRootBlocks()
    this._rebuildBlockMap()
    this._syncDocumentModels()
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

  _hydratePartitionChunk (chunkSize, expectedVersion, expectedRunId) {
    if (
      expectedVersion !== this.partitionVersion ||
      expectedRunId !== this.partitionHydrationRunId
    ) {
      return null
    }

    const target = this._selectPartitionHydrationTarget(chunkSize)
    if (!target) {
      return null
    }

    const {
      block: placeholder,
      chunkStartIndex,
      chunkStartOffset,
      chunkEndOffset,
      beforePlaceholder,
      afterPlaceholder,
      viewportDistance
    } = target

    const chunkMarkdown = this.canonicalMarkdown.slice(chunkStartOffset, chunkEndOffset)
    const parsedBlocks = this.markdownToState(chunkMarkdown)
    this._assignRootEstimates(parsedBlocks, chunkStartIndex)
    this._setRenderState(parsedBlocks, 'rendered')

    const replacement = []
    if (beforePlaceholder) {
      this._setRenderState([beforePlaceholder], 'rendered')
      replacement.push(beforePlaceholder)
    }
    replacement.push(...parsedBlocks)
    if (afterPlaceholder) {
      this._setRenderState([afterPlaceholder], 'rendered')
      replacement.push(afterPlaceholder)
    }

    if (!replacement.length) {
      return null
    }

    if (this._replaceRootBlockWithBlocks(placeholder, replacement)) {
      this._applyVirtualizationState()
      this._renderPartitionReplacement(placeholder, replacement)
    }

    return {
      hasMorePlaceholders: this.blocks.some(block => block.functionType === 'partitionPlaceholder'),
      viewportDistance
    }
  }

  _measureRenderedRootBlocks () {
    for (const block of this.blocks) {
      if (this._getRenderState(block) === 'placeholder') {
        continue
      }
      const dom = document.querySelector(`#${block.key}`)
      if (dom) {
        this.layoutIndex.updateMeasuredHeight(block.key, dom.offsetHeight || this._getEstimatedHeight(block))
      }
    }
  }

  _scheduleUrgentPartitionHydration (chunkSize = URGENT_PARTITION_HYDRATION_CHUNK_SIZE) {
    if (this.urgentPartitionHydrationTask) {
      return
    }

    this._cancelBackgroundPartitionHydrationTask()
    const expectedVersion = this.partitionVersion
    const expectedRunId = this.partitionHydrationRunId

    const hydrateNextChunk = () => {
      this.urgentPartitionHydrationTask = null
      const result = this._hydratePartitionChunk(chunkSize, expectedVersion, expectedRunId)
      if (!result || !result.hasMorePlaceholders) {
        return
      }

      if (result.viewportDistance === 0) {
        this._scheduleUrgentPartitionHydration(chunkSize)
      } else {
        this._scheduleBackgroundPartitionHydration(PARTITION_HYDRATION_CHUNK_SIZE, 0)
      }
    }

    this.urgentPartitionHydrationTask = scheduleFrameTask(hydrateNextChunk)
  }

  _scheduleBackgroundPartitionHydration (chunkSize = PARTITION_HYDRATION_CHUNK_SIZE, delayMs = INITIAL_RENDER_CHUNK_DELAY_MS) {
    this._cancelBackgroundPartitionHydrationTask()
    const expectedVersion = this.partitionVersion
    const expectedRunId = this.partitionHydrationRunId

    const hydrateNextChunk = () => {
      this.backgroundPartitionHydrationTask = null
      const result = this._hydratePartitionChunk(chunkSize, expectedVersion, expectedRunId)
      if (result && result.hasMorePlaceholders) {
        this.backgroundPartitionHydrationTask = scheduleIdleTask(hydrateNextChunk)
      }
    }

    if (delayMs > 0) {
      this.backgroundPartitionHydrationTask = {
        type: 'timeout',
        id: window.setTimeout(() => {
          this.backgroundPartitionHydrationTask = scheduleIdleTask(hydrateNextChunk)
        }, delayMs)
      }
    } else {
      this.backgroundPartitionHydrationTask = scheduleIdleTask(hydrateNextChunk)
    }
  }

  _schedulePartitionHydration (chunkSize = PARTITION_HYDRATION_CHUNK_SIZE, immediate = false) {
    if (immediate) {
      this._scheduleUrgentPartitionHydration(URGENT_PARTITION_HYDRATION_CHUNK_SIZE)
    } else {
      this._scheduleBackgroundPartitionHydration(chunkSize)
    }
  }

  _scheduleInitialRenderChunks (blocks, activeBlocks, matches, chunkSize = 120) {
    const pendingBlocks = blocks.slice()
    if (!pendingBlocks.length) {
      if (this.blocks.some(block => block.functionType === 'partitionPlaceholder')) {
        this._scheduleBackgroundPartitionHydration()
      }
      return
    }

    const renderNextChunk = () => {
      const chunk = pendingBlocks.splice(0, chunkSize)
      if (!chunk.length) {
        this.initialRenderTask = null
        if (this.blocks.some(block => block.functionType === 'partitionPlaceholder')) {
          this._scheduleBackgroundPartitionHydration()
        }
        return
      }

      this._setRenderState(chunk, 'rendered')
      this.stateRender.appendRender(chunk, activeBlocks, matches)
      this.renderRange[1] = chunk[chunk.length - 1].nextSibling
      this._measureRenderedRootBlocks()
      if (pendingBlocks.length) {
        this._applyVirtualizationState()
        this._scheduleRenderSchedulerDrain()
        this.initialRenderTask = scheduleIdleTask(renderNextChunk)
      } else {
        this.initialRenderTask = null
        if (this.blocks.some(block => block.functionType === 'partitionPlaceholder')) {
          this._scheduleBackgroundPartitionHydration()
        }
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
    this._cancelRenderSchedulerTask()
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
    if (this.blocks.some(block => block.functionType === 'partitionPlaceholder')) {
      this._scheduleBackgroundPartitionHydration()
    }
    this._scheduleRenderSchedulerDrain(true)
  }

  refreshViewport (isRenderCursor = false) {
    const { blocks, searchMatches: { matches, index } } = this
    const activeBlocks = this.getActiveBlocks()
    matches.forEach((m, i) => {
      m.active = i === index
    })
    const anchor = this._getViewportAnchor()
    const { changed } = this._applyVirtualizationState()
    const hasPartitionPlaceholders = blocks.some(block => block.functionType === 'partitionPlaceholder')
    if (!changed && !isRenderCursor) {
      if (hasPartitionPlaceholders) {
        this._scheduleUrgentPartitionHydration(URGENT_PARTITION_HYDRATION_CHUNK_SIZE)
      }
      this._measureRenderedRootBlocks()
      this._scheduleRenderSchedulerDrain(true)
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
    if (hasPartitionPlaceholders) {
      this._scheduleUrgentPartitionHydration(URGENT_PARTITION_HYDRATION_CHUNK_SIZE)
    }
    this._scheduleRenderSchedulerDrain(true)
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
    this._cancelRenderSchedulerTask()

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
      this._scheduleBackgroundPartitionHydration()
    }
    this._scheduleRenderSchedulerDrain()
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
    this._cancelRenderSchedulerTask()
    this.history.clearHistory()
  }
}

prototypes.forEach(ctrl => ctrl(ContentState))

export default ContentState
