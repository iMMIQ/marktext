import { parseMarkdownToState } from '../utils/markdownStateParser'

self.addEventListener('message', event => {
  const { id, markdown, options } = event.data || {}
  if (!id) {
    return
  }

  try {
    const result = parseMarkdownToState(markdown || '', options || {})
    self.postMessage({
      id,
      ok: true,
      ...result
    })
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error && error.message ? error.message : String(error)
    })
  }
})
