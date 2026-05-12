const classifyLine = line => {
  const trimmed = line.trim()
  if (!trimmed) {
    return 'blank'
  }
  if (/^ {0,3}(?:`{3,}|~{3,})/u.test(line)) {
    return 'fence'
  }
  if (/^ {0,3}#{1,6}\s/u.test(line)) {
    return 'heading'
  }
  if (/^ {0,3}(?:\*{3,}|-{3,}|_{3,})\s*$/u.test(line)) {
    return 'thematicBreak'
  }
  if (/^ {0,3}>\s/u.test(line)) {
    return 'blockquote'
  }
  if (/^ {0,3}(?:[-+*]|\d+\.)\s/u.test(line)) {
    return 'list'
  }
  if (/^\s*\|.*\|\s*$/u.test(line)) {
    return 'table'
  }
  if (/^ {0,3}</u.test(line)) {
    return 'html'
  }
  return 'paragraph'
}

const shouldStartNewPartition = (currentType, nextType) => {
  if (currentType === nextType) {
    return false
  }

  if (nextType === 'heading' || nextType === 'thematicBreak' || nextType === 'fence') {
    return true
  }

  if (currentType === 'list') {
    return !/^(?:list|paragraph|blockquote)$/u.test(nextType)
  }

  if (currentType === 'blockquote') {
    return nextType !== 'blockquote'
  }

  if (currentType === 'table') {
    return nextType !== 'table'
  }

  if (currentType === 'html') {
    return false
  }

  return nextType !== 'paragraph'
}

const createPartition = ({ id, startOffset, endOffset, startLine, endLine, typeHint, version, lineCount }) => ({
  id,
  startOffset,
  endOffset,
  startLine,
  endLine,
  typeHint,
  version,
  estimatedHeight: Math.max(1, lineCount) * 24,
  parseState: 'pending'
})

export const createPartitionMap = (markdown, version = 0) => {
  const text = typeof markdown === 'string' ? markdown : ''
  const partitions = []
  const linePattern = /(.*?)(\r?\n|$)/g
  let match = null
  let offset = 0
  let lineIndex = 0
  let partitionStartOffset = null
  let partitionStartLine = null
  let partitionTypeHint = 'paragraph'
  let fenceMarker = null

  const flushPartition = (endOffset, endLine) => {
    if (partitionStartOffset === null || partitionStartLine === null || endOffset <= partitionStartOffset) {
      return
    }
    partitions.push(createPartition({
      id: `partition-${version}-${partitions.length}`,
      startOffset: partitionStartOffset,
      endOffset,
      startLine: partitionStartLine,
      endLine,
      typeHint: partitionTypeHint,
      version,
      lineCount: Math.max(1, endLine - partitionStartLine + 1)
    }))
  }

  while ((match = linePattern.exec(text))) {
    const lineText = match[1]
    const lineEnding = match[2] || ''
    if (!lineText && !lineEnding) {
      break
    }
    const lineStartOffset = offset
    const lineEndOffset = lineStartOffset + lineText.length + lineEnding.length
    const lineType = classifyLine(lineText)
    const isFenceLine = /^ {0,3}(?:`{3,}|~{3,})/u.test(lineText)

    if (lineType === 'blank') {
      flushPartition(lineStartOffset, lineIndex - 1)
      partitionStartOffset = null
      partitionStartLine = null
      partitionTypeHint = 'paragraph'
      fenceMarker = null
    } else if (partitionStartOffset === null) {
      partitionStartOffset = lineStartOffset
      partitionStartLine = lineIndex
      partitionTypeHint = lineType
      if (lineType === 'fence') {
        fenceMarker = lineText.trim().slice(0, 3)
      }
    } else if (partitionTypeHint === 'fence') {
      if (isFenceLine && fenceMarker && lineText.trim().startsWith(fenceMarker)) {
        flushPartition(lineEndOffset, lineIndex)
        partitionStartOffset = null
        partitionStartLine = null
        partitionTypeHint = 'paragraph'
        fenceMarker = null
        offset = lineEndOffset
        lineIndex++
        continue
      }
    } else if (shouldStartNewPartition(partitionTypeHint, lineType)) {
      flushPartition(lineStartOffset, lineIndex - 1)
      partitionStartOffset = lineStartOffset
      partitionStartLine = lineIndex
      partitionTypeHint = lineType
      if (lineType === 'fence') {
        fenceMarker = lineText.trim().slice(0, 3)
      }
    }

    if (partitionStartOffset === null && lineType !== 'blank') {
      partitionStartOffset = lineStartOffset
      partitionStartLine = lineIndex
      partitionTypeHint = lineType
      if (lineType === 'fence') {
        fenceMarker = lineText.trim().slice(0, 3)
      }
    }

    offset = lineEndOffset
    lineIndex++
  }

  if (partitionStartOffset !== null && partitionStartLine !== null) {
    flushPartition(offset, lineIndex - 1)
  }

  return partitions
}
