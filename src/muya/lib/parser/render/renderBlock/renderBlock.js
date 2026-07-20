import { CLASS_OR_ID } from '../../../config'
import { h } from '../snabbdom'

/**
 * [renderBlock render one block, no matter it is a container block or text block]
 */
export default function renderBlock (parent, block, activeBlocks, matches, useCache = false) {
  if (!parent && this.isViewportPlaceholder(block)) {
    const data = {
      attrs: {
        spellcheck: 'false',
        contenteditable: 'false'
      },
      style: {
        border: '0',
        margin: '0',
        padding: '0'
      }
    }
    const estimatedHeight = this.getEstimatedHeight(block)
    if (typeof estimatedHeight === 'number' && estimatedHeight > 0) {
      data.style.height = `${estimatedHeight}px`
      data.style['min-height'] = `${estimatedHeight}px`
    }
    return h(`pre#${block.key}.${CLASS_OR_ID.AG_PARAGRAPH}.ag-viewport-placeholder`, data, '')
  }

  const method = Array.isArray(block.children) && block.children.length > 0
    ? 'renderContainerBlock'
    : 'renderLeafBlock'

  return this[method](parent, block, activeBlocks, matches, useCache)
}
