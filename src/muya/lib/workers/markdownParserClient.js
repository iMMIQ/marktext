import { parseMarkdownToState } from '../utils/markdownStateParser'

const WORKER_TIMEOUT_MS = 30000

class MarkdownParserWorkerClient {
  constructor () {
    this.worker = null
    this.pending = new Map()
    this.requestId = 0
    this.available = typeof Worker === 'function'
  }

  _getWorker () {
    if (!this.available) {
      return null
    }
    if (this.worker) {
      return this.worker
    }

    try {
      this.worker = new Worker(new URL('../workers/markdownParser.worker.js', import.meta.url))
      this.worker.addEventListener('message', event => this._handleMessage(event.data))
      this.worker.addEventListener('error', error => this._handleError(error))
      return this.worker
    } catch (error) {
      console.warn('Markdown parser worker unavailable; falling back to main thread parsing.', error)
      this.available = false
      return null
    }
  }

  _handleMessage (message = {}) {
    const pending = this.pending.get(message.id)
    if (!pending) {
      return
    }
    this.pending.delete(message.id)
    window.clearTimeout(pending.timeoutId)

    if (message.ok) {
      pending.resolve({
        blocks: message.blocks,
        languagesToLoad: message.languagesToLoad || []
      })
    } else {
      pending.reject(new Error(message.error || 'Markdown parser worker failed'))
    }
  }

  _handleError (error) {
    const pendingRequests = Array.from(this.pending.values())
    this.pending.clear()
    for (const pending of pendingRequests) {
      window.clearTimeout(pending.timeoutId)
      pending.reject(error)
    }
    this.worker = null
    this.available = false
  }

  parse (markdown, options = {}) {
    const worker = this._getWorker()
    if (!worker) {
      return Promise.resolve(parseMarkdownToState(markdown, options))
    }

    const id = ++this.requestId
    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('Markdown parser worker timed out'))
      }, WORKER_TIMEOUT_MS)

      this.pending.set(id, { resolve, reject, timeoutId })
      try {
        worker.postMessage({ id, markdown, options })
      } catch (error) {
        this.pending.delete(id)
        window.clearTimeout(timeoutId)
        reject(error)
      }
    }).catch(error => {
      console.warn('Markdown parser worker failed; falling back to main thread parsing.', error)
      return parseMarkdownToState(markdown, options)
    })
  }

  terminate () {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timeoutId)
      pending.reject(new Error('Markdown parser worker terminated'))
    }
    this.pending.clear()
  }
}

const markdownParserWorkerClient = new MarkdownParserWorkerClient()

export default markdownParserWorkerClient
