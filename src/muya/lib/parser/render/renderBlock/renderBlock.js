import { CLASS_OR_ID } from '../../../config'
import { h } from '../snabbdom'

/**
 * [renderBlock render one block, no matter it is a container block or text block]
 */
export default function renderBlock (parent, block, activeBlocks, matches, useCache = false) {
  if (!parent && block.renderState === 'placeholder') {
    const data = {
      attrs: {
        spellcheck: 'false',
        contenteditable: 'false'
      },
      style: {}
    }
    if (typeof block.estimatedHeight === 'number' && block.estimatedHeight > 0) {
      data.style['min-height'] = `${block.estimatedHeight}px`
    }
    return h(`pre#${block.key}.${CLASS_OR_ID.AG_PARAGRAPH}.ag-viewport-placeholder`, data, '')
  }

  const method = Array.isArray(block.children) && block.children.length > 0
    ? 'renderContainerBlock'
    : 'renderLeafBlock'

  return this[method](parent, block, activeBlocks, matches, useCache)
}
