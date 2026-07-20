const DEFAULT_CHUNK_SIZE = 32 * 1024

let nextPrioritySeed = 0x9e3779b9
let nextStoreId = 1

const nextPriority = () => {
  nextPrioritySeed ^= nextPrioritySeed << 13
  nextPrioritySeed ^= nextPrioritySeed >>> 17
  nextPrioritySeed ^= nextPrioritySeed << 5
  return nextPrioritySeed >>> 0
}

const countNewlines = text => {
  let count = 0
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) count++
  }
  return count
}

const nodeLength = node => node ? node.length : 0
const nodeNewlines = node => node ? node.newlines : 0

const createNode = (
  text,
  left = null,
  right = null,
  priority = nextPriority(),
  textNewlines = countNewlines(text)
) => ({
  text,
  textNewlines,
  left,
  right,
  priority,
  length: nodeLength(left) + text.length + nodeLength(right),
  newlines: nodeNewlines(left) + textNewlines + nodeNewlines(right)
})

const cloneNode = (node, left, right) => createNode(
  node.text,
  left,
  right,
  node.priority,
  node.textNewlines
)

const merge = (left, right) => {
  if (!left) return right
  if (!right) return left

  if (left.priority <= right.priority) {
    return cloneNode(left, left.left, merge(left.right, right))
  }
  return cloneNode(right, merge(left, right.left), right.right)
}

const split = (node, offset) => {
  if (!node) return [null, null]

  const leftLength = nodeLength(node.left)
  const textEnd = leftLength + node.text.length

  if (offset < leftLength) {
    const [before, after] = split(node.left, offset)
    return [before, cloneNode(node, after, node.right)]
  }

  if (offset > textEnd) {
    const [before, after] = split(node.right, offset - textEnd)
    return [cloneNode(node, node.left, before), after]
  }

  const localOffset = offset - leftLength
  const beforeText = node.text.slice(0, localOffset)
  const afterText = node.text.slice(localOffset)
  const before = beforeText ? merge(node.left, createNode(beforeText)) : node.left
  const after = afterText ? merge(createNode(afterText), node.right) : node.right
  return [before, after]
}

const replaceRange = (root, from, to, insertRoot) => {
  const [before, tail] = split(root, from)
  const [, after] = split(tail, to - from)
  return merge(merge(before, insertRoot), after)
}

const appendSlice = (node, from, to, chunks, baseOffset = 0) => {
  if (!node || from >= to) return

  const leftLength = nodeLength(node.left)
  const textStart = baseOffset + leftLength
  const textEnd = textStart + node.text.length

  if (from < textStart) {
    appendSlice(node.left, from, Math.min(to, textStart), chunks, baseOffset)
  }
  if (from < textEnd && to > textStart) {
    chunks.push(node.text.slice(Math.max(0, from - textStart), Math.min(node.text.length, to - textStart)))
  }
  if (to > textEnd) {
    appendSlice(node.right, Math.max(from, textEnd), to, chunks, textEnd)
  }
}

function * iterateChunks (node) {
  if (!node) return
  yield * iterateChunks(node.left)
  if (node.text) yield node.text
  yield * iterateChunks(node.right)
}

const createTree = (text, chunkSize) => {
  let root = null
  for (let offset = 0; offset < text.length; offset += chunkSize) {
    root = merge(root, createNode(text.slice(offset, offset + chunkSize)))
  }
  return root
}

const validateRange = (from, to, length) => {
  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    throw new TypeError('Document offsets must be integers.')
  }
  if (from < 0 || to < from || to > length) {
    throw new RangeError(`Invalid document range [${from}, ${to}) for length ${length}.`)
  }
}

const normalizeSteps = (steps, length) => {
  if (!Array.isArray(steps) || !steps.length) {
    throw new TypeError('An edit transaction requires at least one replace step.')
  }

  const normalized = steps.map(step => {
    if (!step || typeof step.insert !== 'string') {
      throw new TypeError('Replace steps require string insert content.')
    }
    validateRange(step.from, step.to, length)
    return { from: step.from, to: step.to, insert: step.insert }
  }).sort((a, b) => a.from - b.from || a.to - b.to)

  for (let i = 1; i < normalized.length; i++) {
    if (normalized[i].from < normalized[i - 1].to) {
      throw new RangeError('Replace steps must not overlap.')
    }
  }
  return normalized
}

const mapAnchorThroughStep = (anchor, step) => {
  const { from, to, insert } = step
  const insertLength = insert.length
  const removedLength = to - from
  const offset = anchor.offset

  if (offset < from) return
  if (offset > to || (offset === to && removedLength > 0)) {
    anchor.offset += insertLength - removedLength
    return
  }

  anchor.offset = from + (anchor.affinity === 'right' ? insertLength : 0)
}

export const mapOffsetThroughSteps = (offset, affinity, steps) => {
  const position = { offset, affinity }
  for (let index = steps.length - 1; index >= 0; index--) {
    mapAnchorThroughStep(position, steps[index])
  }
  return position.offset
}

const createInverseSteps = (steps, deletedText) => {
  let delta = 0
  return steps.map((step, index) => {
    const from = step.from + delta
    const inverse = {
      from,
      to: from + step.insert.length,
      insert: deletedText[index]
    }
    delta += step.insert.length - (step.to - step.from)
    return inverse
  })
}

export class DocumentSnapshot {
  constructor (root, revision) {
    this._root = root
    this.revision = revision
    this.length = nodeLength(root)
    this.lineCount = nodeNewlines(root) + 1
  }

  slice (from = 0, to = this.length) {
    validateRange(from, to, this.length)
    const chunks = []
    appendSlice(this._root, from, to, chunks)
    return chunks.join('')
  }

  toString () {
    return Array.from(iterateChunks(this._root)).join('')
  }

  * chunks () {
    yield * iterateChunks(this._root)
  }
}

class DocumentStore {
  constructor (text = '', options = {}) {
    if (typeof text !== 'string') {
      throw new TypeError('DocumentStore text must be a string.')
    }
    this.chunkSize = Math.max(1024, options.chunkSize || DEFAULT_CHUNK_SIZE)
    this._root = createTree(text, this.chunkSize)
    this._revision = 0
    this._storeId = nextStoreId++
    this._anchors = new Set()
  }

  get revision () {
    return this._revision
  }

  get length () {
    return nodeLength(this._root)
  }

  get lineCount () {
    return nodeNewlines(this._root) + 1
  }

  slice (from = 0, to = this.length, snapshot = null) {
    if (snapshot) return snapshot.slice(from, to)
    validateRange(from, to, this.length)
    const chunks = []
    appendSlice(this._root, from, to, chunks)
    return chunks.join('')
  }

  toString () {
    return Array.from(iterateChunks(this._root)).join('')
  }

  equals (text) {
    if (typeof text !== 'string' || text.length !== this.length) return false
    let offset = 0
    for (const chunk of iterateChunks(this._root)) {
      if (text.slice(offset, offset + chunk.length) !== chunk) return false
      offset += chunk.length
    }
    return true
  }

  snapshot () {
    return new DocumentSnapshot(this._root, this._revision)
  }

  createAnchor (offset, affinity = 'right') {
    validateRange(offset, offset, this.length)
    if (affinity !== 'left' && affinity !== 'right') {
      throw new TypeError('Anchor affinity must be "left" or "right".')
    }
    const anchor = {
      _storeId: this._storeId,
      offset,
      affinity,
      revision: this._revision,
      disposed: false
    }
    this._anchors.add(anchor)
    return anchor
  }

  resolveAnchor (anchor) {
    if (!anchor || anchor._storeId !== this._storeId || anchor.disposed || !this._anchors.has(anchor)) {
      throw new Error('Cannot resolve an anchor that does not belong to this document.')
    }
    return anchor.offset
  }

  disposeAnchor (anchor) {
    if (anchor && anchor._storeId === this._storeId) {
      anchor.disposed = true
      this._anchors.delete(anchor)
    }
  }

  apply (transaction) {
    if (!transaction || transaction.baseRevision !== this._revision) {
      throw new Error(`Stale edit transaction: expected revision ${this._revision}.`)
    }

    const steps = normalizeSteps(transaction.steps, this.length)
    const deletedText = steps.map(step => this.slice(step.from, step.to))
    let root = this._root

    for (let index = steps.length - 1; index >= 0; index--) {
      const step = steps[index]
      root = replaceRange(root, step.from, step.to, createTree(step.insert, this.chunkSize))
      for (const anchor of this._anchors) {
        mapAnchorThroughStep(anchor, step)
      }
    }

    this._root = root
    this._revision++
    for (const anchor of this._anchors) {
      anchor.revision = this._revision
    }

    const inverseSteps = createInverseSteps(steps, deletedText)
    return {
      revision: this._revision,
      steps,
      deletedText,
      dirtyRange: {
        from: steps[0].from,
        to: steps[steps.length - 1].to
      },
      inverse: {
        baseRevision: this._revision,
        origin: transaction.origin === 'undo' ? 'redo' : 'undo',
        steps: inverseSteps
      }
    }
  }

  replace (from, to, insert, origin = 'input') {
    return this.apply({
      baseRevision: this._revision,
      origin,
      steps: [{ from, to, insert }]
    })
  }

  replaceAll (text, origin = 'source-mode') {
    if (typeof text !== 'string') {
      throw new TypeError('DocumentStore text must be a string.')
    }
    return this.replace(0, this.length, text, origin)
  }

  syncText (previousText, nextText, origin = 'legacy-block-export') {
    if (typeof previousText !== 'string' || typeof nextText !== 'string') {
      throw new TypeError('Document synchronization requires string values.')
    }
    if (previousText === nextText && this.equals(nextText)) return null
    if (previousText.length !== this.length) {
      throw new Error('Cannot synchronize text from a value that is not the current document revision.')
    }

    let from = 0
    const sharedLength = Math.min(previousText.length, nextText.length)
    while (from < sharedLength && previousText.charCodeAt(from) === nextText.charCodeAt(from)) {
      from++
    }

    let oldTo = previousText.length
    let newTo = nextText.length
    while (
      oldTo > from &&
      newTo > from &&
      previousText.charCodeAt(oldTo - 1) === nextText.charCodeAt(newTo - 1)
    ) {
      oldTo--
      newTo--
    }

    return this.replace(from, oldTo, nextText.slice(from, newTo), origin)
  }
}

export default DocumentStore
