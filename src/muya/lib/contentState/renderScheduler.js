export const RenderPriority = {
  CURSOR: 0,
  VIEWPORT: 1,
  PREFETCH: 2,
  BACKGROUND: 3
}

const REASON_PRIORITY = {
  cursor: RenderPriority.CURSOR,
  history: RenderPriority.CURSOR,
  search: RenderPriority.CURSOR,
  viewport: RenderPriority.VIEWPORT,
  prefetch: RenderPriority.PREFETCH,
  background: RenderPriority.BACKGROUND
}

class RenderScheduler {
  constructor () {
    this.registry = new Map()
    this.queue = []
    this.queuedTasks = new Map()
    this.version = 0
  }

  reset (blockIds = []) {
    this.registry.clear()
    this.queue = []
    this.queuedTasks.clear()
    this.version++
    for (const blockId of blockIds) {
      this.registry.set(blockId, {
        domState: 'unmounted',
        vnodeVersion: 0,
        renderVersion: this.version
      })
    }
  }

  reconcile (blockIds = []) {
    const nextIds = new Set(blockIds)
    for (const blockId of this.registry.keys()) {
      if (!nextIds.has(blockId)) {
        this.registry.delete(blockId)
      }
    }
    for (const blockId of blockIds) {
      this.ensureBlock(blockId)
    }
  }

  ensureBlock (blockId) {
    if (!this.registry.has(blockId)) {
      this.registry.set(blockId, {
        domState: 'unmounted',
        vnodeVersion: 0,
        renderVersion: this.version
      })
    }
    return this.registry.get(blockId)
  }

  getState (blockId) {
    return this.ensureBlock(blockId)
  }

  setDomState (blockId, domState) {
    const state = this.ensureBlock(blockId)
    if (state.domState !== domState) {
      state.vnodeVersion++
    }
    state.domState = domState
    state.renderVersion = this.version
  }

  getDomState (blockId) {
    return this.getState(blockId).domState
  }

  isPlaceholder (blockId) {
    return this.getDomState(blockId) === 'placeholder'
  }

  invalidate (reason = 'viewport') {
    const priority = REASON_PRIORITY[reason] ?? RenderPriority.VIEWPORT
    this.queue = this.queue.filter(task => {
      const keep = task.priority <= priority
      if (!keep && task.abortController) {
        task.abortController.abort()
      }
      if (!keep) {
        this.queuedTasks.delete(task.blockId)
      }
      return keep
    })
    this.version++
  }

  enqueue (blockIds, reason = 'viewport') {
    const priority = REASON_PRIORITY[reason] ?? RenderPriority.VIEWPORT
    const version = this.version
    for (const blockId of blockIds) {
      const existingTask = this.queuedTasks.get(blockId)
      if (existingTask && existingTask.priority <= priority && existingTask.version === version) {
        continue
      }
      if (existingTask && existingTask.abortController) {
        existingTask.abortController.abort()
      }
      const task = {
        blockId,
        priority,
        reason,
        abortController: typeof AbortController === 'function' ? new AbortController() : null,
        version
      }
      this.queuedTasks.set(blockId, task)
      this.queue.push(task)
    }
    this.queue.sort((a, b) => a.priority - b.priority)
  }

  cancelLowerPriorityThan (priority) {
    for (const task of this.queue) {
      if (task.priority > priority && task.abortController) {
        task.abortController.abort()
      }
    }
    this.queue = this.queue.filter(task => {
      const keep = task.priority <= priority
      if (!keep) {
        this.queuedTasks.delete(task.blockId)
      }
      return keep
    })
  }

  flushNext () {
    while (this.queue.length) {
      const task = this.queue.shift()
      if (this.queuedTasks.get(task.blockId) === task) {
        this.queuedTasks.delete(task.blockId)
      }
      if (task.version === this.version && !(task.abortController && task.abortController.signal.aborted)) {
        return task
      }
    }
    return null
  }
}

export default RenderScheduler
